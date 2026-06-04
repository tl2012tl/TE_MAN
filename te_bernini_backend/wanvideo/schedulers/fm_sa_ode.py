"""
SA-ODE Stable - SA-Solver ODE version optimized for convergence stability
Based on successful sa_solver/ode, further improving convergence stability
from https://github.com/eddyhhlure1Eddy/ode-ComfyUI-WanVideoWrapper
"""

import torch
import math
from typing import Optional, Union

class FlowMatchSAODEStableScheduler():
    """
    SA-ODE Stable - Stable convergence version

    Core optimizations:
    1. Pure deterministic ODE (eta=0)
    2. Adaptive multi-step prediction
    3. Convergence phase stabilization
    4. Historical velocity smoothing
    """

    def __init__(
        self,
        num_train_timesteps: int = 1000,
        shift: float = 3.0,
        solver_order: int = 3,  # Default third order
        # Stability parameters
        use_adaptive_order: bool = True,  # Adaptive order
        use_velocity_smoothing: bool = True,  # Velocity smoothing
        convergence_threshold: float = 0.15,  # Convergence threshold (15% start stabilization)
        smoothing_factor: float = 0.8,  # Smoothing factor
    ):
        self.num_train_timesteps = num_train_timesteps
        self.solver_order = solver_order
        self.use_adaptive_order = use_adaptive_order
        self.use_velocity_smoothing = use_velocity_smoothing
        self.convergence_threshold = convergence_threshold
        self.smoothing_factor = smoothing_factor
        print(f"Initialized SA-ODE Stable with solver_order={solver_order}, use_adaptive_order={use_adaptive_order}, use_velocity_smoothing={use_velocity_smoothing}, convergence_threshold={convergence_threshold}, smoothing_factor={smoothing_factor}")

        # State
        self.velocity_buffer = []
        self.smoothed_velocity = None
        self.step_count = 0
        self.shift = shift

    def set_timesteps(
        self,
        num_inference_steps: int,
        device: torch.device = None,
        sigmas: Optional[torch.Tensor] = None,
    ):
        """Set timesteps"""
        self.num_inference_steps = num_inference_steps

        if sigmas is not None:
            self.sigmas = sigmas.to(device)
        else:
            # Choose scheduling strategy based on number of steps
            t = torch.linspace(0, 1, num_inference_steps + 1)

            if num_inference_steps <= 10:
                # Low steps: use simple linear scheduling, avoid complex transformations
                sigmas = 1 - t
            else:
                # High steps: can use more complex scheduling
                # Use smooth cosine scheduling, avoid piecewise discontinuity
                sigmas = 0.5 * (1 + torch.cos(math.pi * t))

            # Apply shift
            sigmas = self.shift * sigmas / (1 + (self.shift - 1) * sigmas)
            self.sigmas = sigmas.to(device)

        # Timesteps
        self.timesteps = self.sigmas[:-1] * self.num_train_timesteps

        # Reset state
        self._reset_state()

    def _reset_state(self):
        """Reset internal state"""
        self.velocity_buffer = []
        self.smoothed_velocity = None
        self.step_count = 0

    def _get_adaptive_order(self, sigma: float) -> int:
        """Adaptively select order based on current position"""
        if not self.use_adaptive_order:
            return self.solver_order

        # Special handling for low steps
        if self.num_inference_steps <= 8:
            # Avoid high-order methods for low steps
            return min(2, self.solver_order)

        # Adaptive strategy for normal steps
        # Early stage: use low order (stable)
        if sigma > 0.7:
            return min(2, self.solver_order)
        # Middle stage: use high order (accurate)
        elif sigma > self.convergence_threshold:
            return self.solver_order
        # Late stage: reduce order (stable convergence)
        else:
            return max(1, self.solver_order - 1)

    def _compute_multistep_velocity(self, order: int) -> torch.Tensor:
        """Multi-step velocity prediction"""
        # Safety check: ensure velocity_buffer is not empty
        if not self.velocity_buffer:
            raise RuntimeError("velocity_buffer is empty")

        if len(self.velocity_buffer) < order:
            order = len(self.velocity_buffer)

        # Safe array access
        if order >= 3 and len(self.velocity_buffer) >= 3:
            # Third-order Adams-Bashforth
            v = (
                (23/12) * self.velocity_buffer[-1] -
                (16/12) * self.velocity_buffer[-2] +
                (5/12) * self.velocity_buffer[-3]
            )
        elif order >= 2 and len(self.velocity_buffer) >= 2:
            # Second-order Adams-Bashforth
            v = 1.5 * self.velocity_buffer[-1] - 0.5 * self.velocity_buffer[-2]
        elif len(self.velocity_buffer) >= 1:
            # First-order (directly use latest velocity)
            v = self.velocity_buffer[-1]
        else:
            raise RuntimeError("No velocity data available")

        return v

    def _apply_velocity_smoothing(self, velocity: torch.Tensor, sigma: float) -> torch.Tensor:
        """Apply velocity smoothing (stable convergence)"""
        if not self.use_velocity_smoothing:
            return velocity

        # Disable smoothing for low steps
        if self.num_inference_steps <= 8:
            return velocity

        # Apply smoothing in convergence phase
        if sigma < self.convergence_threshold:
            if self.smoothed_velocity is None:
                self.smoothed_velocity = velocity
            else:
                # Exponential moving average
                alpha = self.smoothing_factor
                self.smoothed_velocity = alpha * self.smoothed_velocity + (1 - alpha) * velocity
            return self.smoothed_velocity
        else:
            self.smoothed_velocity = velocity
            return velocity

    def step(
        self,
        model_output: torch.Tensor,
        timestep: Union[torch.Tensor, float],
        sample: torch.Tensor,
        generator: Optional[torch.Generator] = None,
        return_dict: bool = True,
    ) -> torch.Tensor:
        """
        Execute SA-ODE Stable step
        """
        # Process timestep
        if isinstance(timestep, torch.Tensor) and timestep.ndim == 2:
            timestep = timestep.flatten(0, 1)

        # Move to device
        self.sigmas = self.sigmas.to(model_output.device)
        self.timesteps = self.timesteps.to(model_output.device)

        # Find index
        if timestep.ndim == 0:
            timestep_idx = torch.argmin((self.timesteps - timestep).abs())
        else:
            timestep_idx = torch.argmin((self.timesteps.unsqueeze(0) - timestep.unsqueeze(1)).abs(), dim=1)

        # Get sigma - add safety check
        if timestep_idx >= len(self.sigmas):
            raise IndexError(f"timestep_idx {timestep_idx} out of range for sigmas length {len(self.sigmas)}")

        sigma = self.sigmas[timestep_idx]
        if timestep_idx + 1 < len(self.sigmas):
            sigma_next = self.sigmas[timestep_idx + 1]
        else:
            # Safe access to last element
            if len(self.sigmas) > 0:
                sigma_next = self.sigmas[-1]
            else:
                raise RuntimeError("sigmas array is empty")

        # Reshape
        if sigma.ndim == 0:
            sigma = sigma.reshape(-1, 1, 1, 1)
            sigma_next = sigma_next.reshape(-1, 1, 1, 1)
            sigma_val = sigma.item()
        else:
            sigma = sigma.reshape(-1, 1, 1, 1)
            sigma_next = sigma_next.reshape(-1, 1, 1, 1)
            sigma_val = sigma[0].item()

        # Store velocity history - add safety check
        if model_output is not None:
            self.velocity_buffer.append(model_output)
            # Safe pop operation
            while len(self.velocity_buffer) > self.solver_order + 1:
                self.velocity_buffer.pop(0)
        else:
            raise ValueError("model_output cannot be None")

        # Adaptively select order
        current_order = self._get_adaptive_order(sigma_val)

        # Multi-step prediction
        if len(self.velocity_buffer) >= 2:
            velocity = self._compute_multistep_velocity(current_order)
        else:
            velocity = model_output

        # Velocity smoothing in convergence phase
        velocity = self._apply_velocity_smoothing(velocity, sigma_val)

        # Step size
        dt = sigma_next - sigma

        # Step size adjustment in convergence phase (disabled for low steps)
        if self.num_inference_steps > 8 and sigma_val < self.convergence_threshold:
            # Use smaller step size in late stage for stability
            damping = 0.5 + 0.5 * (sigma_val / self.convergence_threshold)
            dt = dt * damping

        # Flow Matching update (pure ODE)
        prev_sample = sample + velocity * dt

        # Late stage stabilization (disabled for low steps)
        if self.num_inference_steps > 8 and sigma_val < 0.05 and len(self.velocity_buffer) >= 3:
            # Use historical average for final convergence
            avg_velocity = sum(self.velocity_buffer[-3:]) / 3
            stabilized = sample + avg_velocity * dt
            # Blend original and stabilized results
            blend_factor = sigma_val / 0.05  # 0 to 1
            prev_sample = blend_factor * prev_sample + (1 - blend_factor) * stabilized

        # Update step count
        self.step_count += 1

        if not return_dict:
            return (prev_sample,)

        return prev_sample

    def add_noise(
        self,
        original_samples: torch.Tensor,
        noise: torch.Tensor,
        timestep: Union[torch.Tensor, float]
    ) -> torch.Tensor:
        """Add noise - Flow Matching forward process"""
        if isinstance(timestep, torch.Tensor):
            timestep = timestep.flatten()

        timestep_idx = torch.argmin(
            torch.abs(self.timesteps.unsqueeze(0) - timestep.unsqueeze(1)), dim=1
        )
        sigma = self.sigmas[timestep_idx].reshape(-1, 1, 1, 1)

        # Flow Matching: x_t = (1 - σ) * x_0 + σ * noise
        noisy_samples = (1 - sigma) * original_samples + sigma * noise
        return noisy_samples