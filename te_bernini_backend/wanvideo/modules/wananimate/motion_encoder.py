import torch
from torch.nn import functional as F
import math

# https://github.com/XPixelGroup/BasicSR/blob/8d56e3a045f9fb3e1d8872f92ee4a4f07f886b0a/basicsr/ops/upfirdn2d/upfirdn2d.py#L162
def upfirdn2d_native(input, kernel, up_x, up_y, down_x, down_y, pad_x0, pad_x1, pad_y0, pad_y1):
    _, minor, in_h, in_w = input.shape
    kernel_h, kernel_w = kernel.shape

    out = input.view(-1, minor, in_h, 1, in_w, 1)
    out = F.pad(out, [0, up_x - 1, 0, 0, 0, up_y - 1, 0, 0])
    out = out.view(-1, minor, in_h * up_y, in_w * up_x)

    out = F.pad(out, [max(pad_x0, 0), max(pad_x1, 0), max(pad_y0, 0), max(pad_y1, 0)])
    out = out[:, :, max(-pad_y0, 0): out.shape[2] - max(-pad_y1, 0), max(-pad_x0, 0): out.shape[3] - max(-pad_x1, 0)]

    out = out.reshape([-1, 1, in_h * up_y + pad_y0 + pad_y1, in_w * up_x + pad_x0 + pad_x1])
    w = torch.flip(kernel, [0, 1]).view(1, 1, kernel_h, kernel_w)
    out = F.conv2d(out, w)
    out = out.reshape(-1, minor, in_h * up_y + pad_y0 + pad_y1 - kernel_h + 1, in_w * up_x + pad_x0 + pad_x1 - kernel_w + 1)
    return out[:, :, ::down_y, ::down_x]

def upfirdn2d(input, kernel, up=1, down=1, pad=(0, 0)):
    return upfirdn2d_native(input, kernel, up, up, down, down, pad[0], pad[1], pad[0], pad[1])

# https://github.com/XPixelGroup/BasicSR/blob/8d56e3a045f9fb3e1d8872f92ee4a4f07f886b0a/basicsr/ops/fused_act/fused_act.py#L81
class FusedLeakyReLU(torch.nn.Module):
    def __init__(self, channel, negative_slope=0.2, scale=2 ** 0.5):
        super().__init__()
        self.bias = torch.nn.Parameter(torch.zeros(1, channel, 1, 1))
        self.negative_slope = negative_slope
        self.scale = scale

    def forward(self, input):
        return fused_leaky_relu(input, self.bias, self.negative_slope, self.scale)

def fused_leaky_relu(input, bias, negative_slope=0.2, scale=2 ** 0.5):
    return F.leaky_relu(input + bias, negative_slope) * scale

class Blur(torch.nn.Module):
    def __init__(self, kernel, pad):
        super().__init__()
        kernel = torch.tensor(kernel, dtype=torch.float32)
        kernel = kernel[None, :] * kernel[:, None]
        kernel = kernel / kernel.sum()
        self.register_buffer('kernel', kernel)
        self.pad = pad

    def forward(self, input):
        return upfirdn2d(input, self.kernel, pad=self.pad)

#https://github.com/XPixelGroup/BasicSR/blob/8d56e3a045f9fb3e1d8872f92ee4a4f07f886b0a/basicsr/archs/stylegan2_arch.py#L590
class ScaledLeakyReLU(torch.nn.Module):
    def __init__(self, negative_slope=0.2):
        super().__init__()
        self.negative_slope = negative_slope

    def forward(self, input):
        return F.leaky_relu(input, negative_slope=self.negative_slope)

# https://github.com/XPixelGroup/BasicSR/blob/8d56e3a045f9fb3e1d8872f92ee4a4f07f886b0a/basicsr/archs/stylegan2_arch.py#L605
class EqualConv2d(torch.nn.Module):
    def __init__(self, in_channel, out_channel, kernel_size, stride=1, padding=0, bias=True):
        super().__init__()
        self.weight = torch.nn.Parameter(torch.randn(out_channel, in_channel, kernel_size, kernel_size))
        self.scale = 1 / math.sqrt(in_channel * kernel_size ** 2)
        self.stride = stride
        self.padding = padding
        self.bias = torch.nn.Parameter(torch.zeros(out_channel)) if bias else None

    def forward(self, input):
        return F.conv2d(input, self.weight * self.scale, bias=self.bias, stride=self.stride, padding=self.padding)

# https://github.com/XPixelGroup/BasicSR/blob/8d56e3a045f9fb3e1d8872f92ee4a4f07f886b0a/basicsr/archs/stylegan2_arch.py#L134
class EqualLinear(torch.nn.Module):
    def __init__(self, in_dim, out_dim, bias=True, bias_init=0, lr_mul=1, activation=None):
        super().__init__()
        self.weight = torch.nn.Parameter(torch.randn(out_dim, in_dim).div_(lr_mul))
        self.bias = torch.nn.Parameter(torch.zeros(out_dim).fill_(bias_init)) if bias else None
        self.activation = activation
        self.scale = (1 / math.sqrt(in_dim)) * lr_mul
        self.lr_mul = lr_mul

    def forward(self, input):
        if self.activation:
            out = F.linear(input, self.weight * self.scale)
            return fused_leaky_relu(out, self.bias * self.lr_mul)
        return F.linear(input, self.weight * self.scale, bias=self.bias * self.lr_mul)

# https://github.com/XPixelGroup/BasicSR/blob/8d56e3a045f9fb3e1d8872f92ee4a4f07f886b0a/basicsr/archs/stylegan2_arch.py#L654
class ConvLayer(torch.nn.Sequential):
    def __init__(self, in_channel, out_channel, kernel_size, downsample=False, blur_kernel=[1, 3, 3, 1], bias=True, activate=True):
        layers = []

        if downsample:
            factor = 2
            p = (len(blur_kernel) - factor) + (kernel_size - 1)
            layers.append(Blur(blur_kernel, pad=((p + 1) // 2, p // 2)))
            stride, padding = 2, 0
        else:
            stride, padding = 1, kernel_size // 2

        layers.append(EqualConv2d(in_channel, out_channel, kernel_size, padding=padding, stride=stride, bias=bias and not activate))

        if activate:
            layers.append(FusedLeakyReLU(out_channel) if bias else ScaledLeakyReLU(0.2))

        super().__init__(*layers)

# https://github.com/XPixelGroup/BasicSR/blob/8d56e3a045f9fb3e1d8872f92ee4a4f07f886b0a/basicsr/archs/stylegan2_arch.py#L704
class ResBlock(torch.nn.Module):
    def __init__(self, in_channel, out_channel):
        super().__init__()
        self.conv1 = ConvLayer(in_channel, in_channel, 3)
        self.conv2 = ConvLayer(in_channel, out_channel, 3, downsample=True)
        self.skip = ConvLayer(in_channel, out_channel, 1, downsample=True, activate=False, bias=False)

    def forward(self, input):
        out = self.conv2(self.conv1(input))
        skip = self.skip(input)
        return (out + skip) / math.sqrt(2)


class AppearanceEncoder(torch.nn.Module):
    def __init__(self, w_dim=512):
        super().__init__()

        self.convs = torch.nn.ModuleList([
            ConvLayer(3, 32, 1), ResBlock(32, 64),
            ResBlock(64, 128), ResBlock(128, 256),
            ResBlock(256, 512), ResBlock(512, 512),
            ResBlock(512, 512), ResBlock(512, 512),
            EqualConv2d(512, w_dim, 4, padding=0, bias=False)
        ])

    def forward(self, x):
        for conv in self.convs:
            x = conv(x)
        return x.squeeze((-2, -1))

class MotionEncoder(torch.nn.Module):
    def __init__(self, dim=512, motion_dim=20):
        super().__init__()
        self.net_app = AppearanceEncoder(dim)
        self.fc = torch.nn.Sequential(*[EqualLinear(dim, dim) for _ in range(4)] + [EqualLinear(dim, motion_dim)])

    def encode_motion(self, x):
        return self.fc(self.net_app(x))

class MotionProjector(torch.nn.Module):
    def __init__(self, m_dim):
        super().__init__()
        self.weight = torch.nn.Parameter(torch.randn(512, m_dim))
        self.motion_dim = m_dim

    def forward(self, input):
        stabilized_weight = self.weight + 1e-8 * torch.eye(512, self.motion_dim, device=self.weight.device, dtype=self.weight.dtype)
        Q, _ = torch.linalg.qr(stabilized_weight)
        if input is None:
            return Q
        return torch.sum(input.unsqueeze(-1) * Q.T, dim=1)

class MotionDecoder(torch.nn.Module):
    def __init__(self, m_dim):
        super().__init__()
        self.direction = MotionProjector(m_dim)

class MotionExtractor(torch.nn.Module):
    def __init__(self, s_dim=512, m_dim=20):
        super().__init__()
        self.enc = MotionEncoder(s_dim, m_dim)
        self.dec = MotionDecoder(m_dim)

    def forward(self, img):
        motion_feat = self.enc.encode_motion(img)
        return self.dec.direction(motion_feat)