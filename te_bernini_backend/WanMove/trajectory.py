# https://github.com/ali-vilab/Wan-Move/blob/main/wan/modules/trajectory.py

import numpy as np
import torch
from PIL import Image, ImageDraw

SKIP_ZERO = False

def get_pos_emb(
    pos_k: torch.Tensor,
    pos_emb_dim: int,
    theta_func: callable = lambda i, d: torch.pow(10000, torch.mul(2, torch.div(i.to(torch.float32), d))),
    device: torch.device = torch.device("cuda" if torch.cuda.is_available() else "cpu"),
    dtype: torch.dtype = torch.float32,
) -> torch.Tensor:
    """
    Generate batch position embeddings.

    Args:
        pos_k (torch.Tensor): A 1D tensor containing positions for which to generate embeddings.
        pos_emb_dim (int): The dimension of position embeddings.
        theta_func (callable): Function to compute thetas based on position and embedding dimensions.
        device (torch.device): Device to store the position embeddings.
        dtype (torch.dtype): Desired data type for computations.

    Returns:
        torch.Tensor: The position embeddings with shape (batch_size, pos_emb_dim).
    """
    assert pos_emb_dim % 2 == 0, "The dimension of position embeddings must be even."
    pos_k = pos_k.to(device, dtype)
    if SKIP_ZERO:
        pos_k = pos_k + 1
    batch_size = pos_k.size(0)

    denominator = torch.arange(0, pos_emb_dim // 2, device=device, dtype=dtype)
    # Expand denominator to match the shape needed for broadcasting
    denominator_expanded = denominator.view(1, -1).expand(batch_size, -1)

    thetas = theta_func(denominator_expanded, pos_emb_dim)

    # Ensure pos_k is in the correct shape for broadcasting
    pos_k_expanded = pos_k.view(-1, 1).to(dtype)
    sin_thetas = torch.sin(torch.div(pos_k_expanded, thetas))
    cos_thetas = torch.cos(torch.div(pos_k_expanded, thetas))

    # Concatenate sine and cosine embeddings along the last dimension
    pos_emb = torch.cat([sin_thetas, cos_thetas], dim=-1)

    return pos_emb

def create_pos_feature_map(
    pred_tracks: torch.Tensor, # [T, N, 2]
    pred_visibility: torch.Tensor, # [T, N]
    downsample_ratios: list[int],
    height: int,
    width: int,
    pos_emb_dim: int,
    track_num: int = -1,
    t_down_strategy: str = "sample",
    device: torch.device = torch.device("cuda" if torch.cuda.is_available() else "cpu"),
    dtype: torch.dtype = torch.float32,
):
    """
    Create a feature map from the predicted tracks.

    Args:
    - pred_tracks: torch.Tensor, the predicted tracks, [T, N, 2]
    - pred_visibility: torch.Tensor, the predicted visibility, [T, N]
    - downsample_ratios: list[int], the ratios for downsampling time, height, and width
    - height: int, the height of the feature map
    - width: int, the width of the feature map
    - pos_emb_dim: int, the dimension of the position embeddings
    - track_num: int, the number of tracks to use
    - t_down_strategy: str, the strategy for downsampling time dimension
    - device: torch.device, the device
    - dtype: torch.dtype, the data type

    Returns:
    - feature_map: torch.Tensor, the feature map, [T', H', W', pos_emb_dim]
    - track_pos: torch.Tensor, the position embeddings, [N, T', 2], 2 = height, width
    """

    assert t_down_strategy in ["sample", "average"], "Invalid strategy for downsampling time dimension."

    t, n, _ = pred_tracks.shape
    t_down, h_down, w_down = downsample_ratios
    feature_map = torch.zeros((t-1) // t_down + 1, height // h_down, width // w_down, pos_emb_dim, device=device, dtype=dtype)
    track_pos = - torch.ones(n, (t-1) // t_down + 1, 2, dtype=torch.long)

    if track_num == -1:
        track_num = n

    tracks_idx = torch.randperm(n)[:track_num]
    tracks = pred_tracks[:, tracks_idx]
    visibility = pred_visibility[:, tracks_idx]
    #tracks_embs = get_pos_emb(torch.randperm(n)[:track_num], pos_emb_dim, device=device, dtype=dtype)

    for t_idx in range(0, t, t_down):
        if t_down_strategy == "sample" or t_idx == 0:
            cur_tracks = tracks[t_idx] # [N, 2]
            cur_visibility = visibility[t_idx] # [N]
        else:
            cur_tracks = tracks[t_idx:t_idx+t_down].mean(dim=0)
            cur_visibility = torch.any(visibility[t_idx:t_idx+t_down], dim=0)

        for i in range(track_num):
            if not cur_visibility[i] or cur_tracks[i][0] < 0 or cur_tracks[i][1] < 0 or cur_tracks[i][0] >= width or cur_tracks[i][1] >= height:
                continue
            x, y = cur_tracks[i]
            x, y = int(x // w_down), int(y // h_down)
            #feature_map[t_idx // t_down, y, x] += tracks_embs[i]
            track_pos[i, t_idx // t_down, 0], track_pos[i, t_idx // t_down, 1] = y, x

    return feature_map, track_pos


def replace_feature(
    vae_feature: torch.Tensor,  # [B, C', T', H', W']
    track_pos: torch.Tensor,    # [B, N, T', 2]
    strength: float = 1.0,
) -> torch.Tensor:
    b, _, t, h, w = vae_feature.shape
    assert b == track_pos.shape[0], "Batch size mismatch."
    n = track_pos.shape[1]

    # Shuffle the trajectory order
    track_pos = track_pos[:, torch.randperm(n), :, :]

    # Extract coordinates at time steps ≥ 1 and generate a valid mask
    current_pos = track_pos[:, :, 1:, :]  # [B, N, T-1, 2]
    mask = (current_pos[..., 0] >= 0) & (current_pos[..., 1] >= 0)  # [B, N, T-1]

    # Get all valid indices
    valid_indices = mask.nonzero(as_tuple=False)  # [num_valid, 3]
    num_valid = valid_indices.shape[0]

    if num_valid == 0:
        return vae_feature

    # Decompose valid indices into each dimension
    batch_idx = valid_indices[:, 0]
    track_idx = valid_indices[:, 1]
    t_rel = valid_indices[:, 2]
    t_target = t_rel + 1  # Convert to original time step indices

    # Extract target position coordinates
    h_target = current_pos[batch_idx, track_idx, t_rel, 0].long()  # Ensure integer indices
    w_target = current_pos[batch_idx, track_idx, t_rel, 1].long()

    # Extract source position coordinates (t=0)
    h_source = track_pos[batch_idx, track_idx, 0, 0].long()
    w_source = track_pos[batch_idx, track_idx, 0, 1].long()

    # Get source features and assign to target positions
    src_features = vae_feature[batch_idx, :, 0, h_source, w_source]
    dst_features = vae_feature[batch_idx, :, t_target, h_target, w_target]

    vae_feature[batch_idx, :, t_target, h_target, w_target] = dst_features + (src_features - dst_features) * strength

    return vae_feature

def get_video_track_video(
    model,
    video_tensor: torch.Tensor, # [T, C, H, W]
    downsample_ratios: list[int],
    pos_emb_dim: int,
    grid_size: int = 32,
    track_num: int = -1,
    t_down_strategy: str = "sample",
    device: torch.device = torch.device("cuda" if torch.cuda.is_available() else "cpu"),
    dtype: torch.dtype = torch.float32,
) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Get the track video from the video tensor.

    Args:
    - model: torch.nn.Module, the model for tracking, CoTracker
    - video_tensor: torch.Tensor, the video tensor, [T, C, H, W]
    - downsample_ratios: list[int], the ratios for downsampling time, height, and width
    - height: int, the height of the feature map
    - width: int, the width of the feature map
    - pos_emb_dim: int, the dimension of the position embeddings
    - grid_size: int, the size of the grid
    - track_num: int, the number of tracks to use
    - t_down_strategy: str, the strategy for downsampling time dimension
    - device: torch.device, the device
    - dtype: torch.dtype, the data type

    Returns:
    -  track_video: torch.Tensor, the track video, [pos_emb_dim, T', H', W']
    -  track_pos: torch.Tensor, the position embeddings, [N, T', 2], 2 = height, width
    -  pred_tracks: the predicted point trajectories
    -  pred_visibility: visibility of the predicted point trajectories
    """

    t, c, height, width = video_tensor.shape
    with (
        torch.autocast(device_type=device.type, dtype=dtype),
        torch.no_grad(),
    ):
        pred_tracks, pred_visibility = model(
            video_tensor.unsqueeze(0),
            grid_size=grid_size,
            backward_tracking=False,
        )

    track_video, track_pos = create_pos_feature_map(
        pred_tracks[0], pred_visibility[0], downsample_ratios, height, width, pos_emb_dim, track_num, t_down_strategy, device, dtype
    )

    return track_video.permute(3, 0, 1, 2), track_pos, pred_tracks, pred_visibility

# ---------------------------
# Visualize functions
# --------------------------

def add_weighted(rgb, track):
    rgb = np.array(rgb) # [H, W, C] "RGB"
    track = np.array(track) # [H, W, C] "RGBA"

    # Compute weights from the alpha channel
    alpha = track[:, :, 3] / 255.0

    # Expand alpha to 3 channels to match RGB
    alpha = np.stack([alpha] * 3, axis=-1)

    # Blend the two images
    blend_img = track[:, :, :3] * alpha + rgb * (1 - alpha)

    return Image.fromarray(blend_img.astype(np.uint8))

def draw_tracks_on_video(video, tracks, visibility=None, track_frame=24, circle_size=12, opacity=0.5, line_width=16):
    color_map = [(102, 153, 255), (0, 255, 255), (255, 255, 0), (255, 102, 204), (0, 255, 0)]

    video = video.byte().cpu().numpy()  # (81, 480, 832, 3)
    tracks = tracks[0].long().detach().cpu().numpy()
    if visibility is not None:
        visibility = visibility[0].detach().cpu().numpy()

    num_frames, height, width = video.shape[:3]
    num_tracks = tracks.shape[1]
    alpha_opacity = int(255 * opacity)

    output_frames = []
    for t in range(num_frames):
        frame_rgb = video[t].astype(np.float32)

        # Create a single RGBA overlay for all tracks in this frame
        overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw_overlay = ImageDraw.Draw(overlay)

        polyline_data = []

        # Draw all circles on a single overlay
        for n in range(num_tracks):
            if visibility is not None and visibility[t, n] == 0:
                continue

            track_coord = tracks[t, n]
            color = color_map[n % len(color_map)]
            circle_color = color + (alpha_opacity,)

            draw_overlay.ellipse(
                (
                    track_coord[0] - circle_size,
                    track_coord[1] - circle_size,
                    track_coord[0] + circle_size,
                    track_coord[1] + circle_size
                ),
                fill=circle_color
            )

            # Store polyline data for batch processing
            tracks_coord = tracks[max(t - track_frame, 0):t + 1, n]
            if len(tracks_coord) > 1:
                polyline_data.append((tracks_coord, color))

        # Blend circles overlay once
        overlay_np = np.array(overlay)
        alpha = overlay_np[:, :, 3:4] / 255.0
        frame_rgb = overlay_np[:, :, :3] * alpha + frame_rgb * (1 - alpha)

        # Draw all polylines on a single overlay
        if polyline_data:
            polyline_overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            for tracks_coord, color in polyline_data:
                _draw_gradient_polyline_on_overlay(polyline_overlay, line_width, tracks_coord, color, opacity)

            # Blend polylines overlay once
            polyline_np = np.array(polyline_overlay)
            alpha = polyline_np[:, :, 3:4] / 255.0
            frame_rgb = polyline_np[:, :, :3] * alpha + frame_rgb * (1 - alpha)

        output_frames.append(Image.fromarray(frame_rgb.astype(np.uint8)))

    return output_frames


def _draw_gradient_polyline_on_overlay(overlay, line_width, points, start_color, opacity=1.0):
    """
    Draw a gradient polyline directly onto an existing RGBA overlay image.
    This is an optimized version that doesn't create new images.
    """
    draw = ImageDraw.Draw(overlay, 'RGBA')
    points = points[::-1]

    # Compute total length
    total_length = 0
    segment_lengths = []
    for i in range(len(points) - 1):
        dx = points[i + 1][0] - points[i][0]
        dy = points[i + 1][1] - points[i][1]
        length = (dx * dx + dy * dy) ** 0.5
        segment_lengths.append(length)
        total_length += length

    if total_length == 0:
        return

    accumulated_length = 0

    # Draw the gradient polyline
    for idx, (start_point, end_point) in enumerate(zip(points[:-1], points[1:])):
        segment_length = segment_lengths[idx]
        steps = max(int(segment_length), 1)

        for i in range(steps):
            current_length = accumulated_length + (i / steps) * segment_length
            ratio = current_length / total_length

            alpha = int(255 * (1 - ratio) * opacity)
            color = (*start_color, alpha)

            x = int(start_point[0] + (end_point[0] - start_point[0]) * i / steps)
            y = int(start_point[1] + (end_point[1] - start_point[1]) * i / steps)

            dynamic_line_width = max(int(line_width * (1 - ratio)), 1)
            draw.line([(x, y), (x + 1, y)], fill=color, width=dynamic_line_width)

        accumulated_length += segment_length
