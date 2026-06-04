from torch import nn
import torch
from einops import rearrange
import torch.nn.functional as F
from ..attention import attention

class CausalConv1d(nn.Module):
    def __init__(self, chan_in, chan_out, kernel_size=3, stride=1, dilation=1, pad_mode="replicate", **kwargs):
        super().__init__()

        self.pad_mode = pad_mode
        padding = (kernel_size - 1, 0)  # T
        self.time_causal_padding = padding

        self.conv = nn.Conv1d(chan_in, chan_out, kernel_size, stride=stride, dilation=dilation, **kwargs)

    def forward(self, x):
        x = F.pad(x, self.time_causal_padding, mode=self.pad_mode)
        return self.conv(x)


class FaceEncoder(nn.Module):
    def __init__(self, in_dim: int, out_dim: int, num_heads: int, dtype=None, device=None):
        super().__init__()
        self.dtype = dtype
        self.device = device

        self.num_heads = num_heads
        self.conv1_local = CausalConv1d(in_dim, 1024 * num_heads, 3, stride=1)
        self.norm1 = nn.LayerNorm(1024, elementwise_affine=False, eps=1e-6, device=device, dtype=dtype)
        self.act = nn.SiLU()
        self.conv2 = CausalConv1d(1024, 1024, 3, stride=2)
        self.conv3 = CausalConv1d(1024, 1024, 3, stride=2)

        self.out_proj = nn.Linear(1024, out_dim)

        self.norm2 = nn.LayerNorm(1024, elementwise_affine=False, eps=1e-6, device=device, dtype=dtype)
        self.norm3 = nn.LayerNorm(1024, elementwise_affine=False, eps=1e-6, device=device, dtype=dtype)

        self.padding_tokens = nn.Parameter(torch.zeros(1, 1, 1, out_dim))

    def forward(self, x):
        x = rearrange(x, "b t c -> b c t")
        b = x.shape[0]

        x = self.conv1_local(x)
        x = rearrange(x, "b (n c) t -> (b n) t c", n=self.num_heads)

        x = self.norm1(x)
        x = self.act(x)
        x = rearrange(x, "b t c -> b c t")
        x = self.conv2(x)
        x = rearrange(x, "b c t -> b t c")
        x = self.norm2(x)
        x = self.act(x)
        x = rearrange(x, "b t c -> b c t")
        x = self.conv3(x)
        x = rearrange(x, "b c t -> b t c")
        x = self.norm3(x)
        x = self.act(x)
        x = self.out_proj(x)
        x = rearrange(x, "(b n) t c -> b t n c", b=b)
        padding = self.padding_tokens.repeat(b, x.shape[1], 1, 1)

        return torch.cat([x, padding], dim=-2)


class RMSNorm(nn.Module):
    def __init__(self, dim, elementwise_affine=True, eps=1e-6, device=None, dtype=None):
        super().__init__()
        self.eps = eps
        if elementwise_affine:
            self.weight = nn.Parameter(torch.ones(dim, device=device, dtype=dtype))

    def _norm(self, x):
        return x * torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + self.eps)

    def forward(self, x):
        output = self._norm(x.float()).type_as(x)
        if hasattr(self, "weight"):
            output = output * self.weight
        return output


class FaceBlock(nn.Module):
    def __init__(self, feature_dim, num_heads, dtype=None, device=None):
        super().__init__()

        self.feature_dim = feature_dim
        self.num_heads = num_heads
        head_dim = feature_dim // num_heads

        self.linear1_kv = nn.Linear(feature_dim, feature_dim * 2, device=device, dtype=dtype)
        self.linear1_q = nn.Linear(feature_dim, feature_dim, device=device, dtype=dtype)
        self.linear2 = nn.Linear(feature_dim, feature_dim, device=device, dtype=dtype)

        self.q_norm = (RMSNorm(head_dim, elementwise_affine=True, eps=1e-6, device=device, dtype=dtype))
        self.k_norm = (RMSNorm(head_dim, elementwise_affine=True, eps=1e-6, device=device, dtype=dtype))

        self.pre_norm_feat = nn.LayerNorm(feature_dim, elementwise_affine=False, eps=1e-6, device=device, dtype=dtype)
        self.pre_norm_motion = nn.LayerNorm(feature_dim, elementwise_affine=False, eps=1e-6, device=device, dtype=dtype)


    def forward(self, x, motion_vec, motion_mask=None):
        B, T, N, C = motion_vec.shape

        x_motion = self.pre_norm_motion(motion_vec)
        x_feat = self.pre_norm_feat(x)

        kv = self.linear1_kv(x_motion)
        q = self.linear1_q(x_feat)

        k, v = rearrange(kv, "B L N (K H D) -> K B L N H D", K=2, H=self.num_heads)
        q = rearrange(q, "B S (H D) -> B S H D", H=self.num_heads)

        q = self.q_norm(q).to(v)
        k = self.k_norm(k).to(v)

        k = rearrange(k, "B L N H D -> (B L) N H D")
        v = rearrange(v, "B L N H D -> (B L) N H D")
        q = rearrange(q, "B (L S) H D -> (B L) S H D", L=T)

        attn = attention(q, k, v)
        attn = attn.reshape(attn.shape[0], attn.shape[1], -1)
        attn = rearrange(attn, "(B L) S C -> B (L S) C", L=T)
        output = self.linear2(attn)

        if motion_mask is not None:
            output = output * rearrange(motion_mask, "B T H W -> B (T H W)").unsqueeze(-1)

        return output