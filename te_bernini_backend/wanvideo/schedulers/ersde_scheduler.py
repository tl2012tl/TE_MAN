import torch

class ERSDEScheduler():
    """Extended Reverse-Time SDE solver (VP ER-SDE-Solver-3).

    Based on: arXiv: https://arxiv.org/abs/2309.06169
    Code reference: https://github.com/QinpengCui/ER-SDE-Solver/blob/main/er_sde_solver.py
    """

    def __init__(self, num_inference_steps=100, num_train_timesteps=1000, shift=3.0,
                 sigma_max=1.0, sigma_min=0.003 / 1.002, max_stage=3, s_noise=1.0,
                 num_integration_points=200):
        self.num_train_timesteps = num_train_timesteps
        self.shift = shift
        self.sigma_max = sigma_max
        self.sigma_min = sigma_min
        self.max_stage = max_stage
        self.s_noise = s_noise
        self.num_integration_points = num_integration_points
        self.set_timesteps(num_inference_steps)
        self.old_denoised = None
        self.old_denoised_d = None
        self.step_index = 0

    def set_timesteps(self, num_inference_steps=100, denoising_strength=1.0, sigmas=None):
        """Generate the full sigma schedule (from max to min)."""
        full_sigmas = torch.linspace(self.sigma_max, self.sigma_min, self.num_train_timesteps)
        ss = len(full_sigmas) / num_inference_steps
        if sigmas is None:
            sigmas = []
            for x in range(num_inference_steps):
                idx = int(round(x * ss))
                sigmas.append(float(full_sigmas[idx]))
            sigmas.append(0.0)
        self.sigmas = torch.FloatTensor(sigmas)
        self.sigmas = self.shift * self.sigmas / (1 + (self.shift - 1) * self.sigmas)
        self.timesteps = self.sigmas[:-1] * self.num_train_timesteps
        self.step_index = 0
        self.old_denoised = None
        self.old_denoised_d = None

    def default_er_sde_noise_scaler(self, x):
        return x * ((x ** 0.3).exp() + 10.0)

    def step(self, model_output, timestep, sample, generator):

        if timestep.ndim == 2:
            timestep = timestep.flatten(0, 1)

        self.sigmas = self.sigmas.to(model_output.device)
        self.timesteps = self.timesteps.to(model_output.device)

        if timestep.ndim == 0:
            timestep_id = torch.argmin((self.timesteps - timestep).abs(), dim=0)
        else:
            timestep_id = torch.argmin((self.timesteps.unsqueeze(0) - timestep.unsqueeze(1)).abs(), dim=1)

        noise_scaler = self.default_er_sde_noise_scaler

        # Get current and next sigma
        sigma = self.sigmas[timestep_id].reshape(-1, 1, 1, 1)
        if (timestep_id + 1 >= len(self.sigmas)).any():
            sigma_next = torch.zeros_like(sigma)
        else:
            sigma_next = self.sigmas[timestep_id + 1].reshape(-1, 1, 1, 1)

        er_lambda_s = sigma
        er_lambda_t = sigma_next

        # Calculate alpha values
        alpha_s = sigma / (er_lambda_s + 1e-10)
        alpha_t = sigma_next / (er_lambda_t + 1e-10)
        r_alpha = alpha_t / (alpha_s + 1e-10)

        # Denoised prediction (x_0 estimate)
        denoised = sample - sigma * model_output

        # Determine which stage to use
        stage_used = min(self.max_stage, self.step_index + 1)

        if sigma_next == 0 or (sigma_next == 0.0).all():
            # Final step - return denoised
            x = denoised
        else:
            r = noise_scaler(er_lambda_t) / (noise_scaler(er_lambda_s) + 1e-10)

            # Stage 1: Euler step
            x = r_alpha * r * sample + alpha_t * (1 - r) * denoised

            if stage_used >= 2 and self.old_denoised is not None:
                dt = er_lambda_t - er_lambda_s
                lambda_step_size = -dt / self.num_integration_points

                # Create integration points
                point_indice = torch.arange(0, self.num_integration_points,
                                           dtype=torch.float32, device=sample.device)
                lambda_pos = er_lambda_t + point_indice * lambda_step_size
                scaled_pos = noise_scaler(lambda_pos)

                # Stage 2: Second-order correction
                s = torch.sum(1 / (scaled_pos + 1e-10)) * lambda_step_size

                # Get previous sigma for derivative calculation
                if timestep_id > 0:
                    sigma_prev = self.sigmas[timestep_id - 1].reshape(-1, 1, 1, 1)
                    er_lambda_prev = sigma_prev
                else:
                    er_lambda_prev = er_lambda_s

                denoised_d = (denoised - self.old_denoised) / ((er_lambda_s - er_lambda_prev) + 1e-10)
                x = x + alpha_t * (dt + s * noise_scaler(er_lambda_t)) * denoised_d

                if stage_used >= 3 and self.old_denoised_d is not None:
                    # Stage 3: Third-order correction
                    s_u = torch.sum((lambda_pos - er_lambda_s) / (scaled_pos + 1e-10)) * lambda_step_size

                    # Get sigma from two steps ago
                    if timestep_id > 1:
                        sigma_prev_prev = self.sigmas[timestep_id - 2].reshape(-1, 1, 1, 1)
                        er_lambda_prev_prev = sigma_prev_prev
                    else:
                        er_lambda_prev_prev = er_lambda_prev

                    denoised_u = (denoised_d - self.old_denoised_d) / (((er_lambda_s - er_lambda_prev_prev) / 2) + 1e-10)
                    x = x + alpha_t * ((dt ** 2) / 2 + s_u * noise_scaler(er_lambda_t)) * denoised_u

                self.old_denoised_d = denoised_d

            # Add stochastic noise
            if self.s_noise > 0:
                noise_term = (er_lambda_t ** 2 - er_lambda_s ** 2 * r ** 2).sqrt()
                noise_term = torch.nan_to_num(noise_term, nan=0.0)
                noise = torch.randn(*x.shape, dtype=torch.float32, device=torch.device("cpu"), generator=generator).to(x)
                x = x + alpha_t * noise * self.s_noise * noise_term

        # Store current denoised for next iteration
        self.old_denoised = denoised
        self.step_index += 1

        return x

    def add_noise(self, original_samples, noise, timestep):
        if timestep.ndim == 2:
            timestep = timestep.flatten(0, 1)

        self.sigmas = self.sigmas.to(noise.device)
        self.timesteps = self.timesteps.to(noise.device)

        timestep_id = torch.argmin(
            (self.timesteps.unsqueeze(0) - timestep.unsqueeze(1)).abs(), dim=1)
        sigma = self.sigmas[timestep_id].reshape(-1, 1, 1, 1)

        sample = (1 - sigma) * original_samples + sigma * noise
        return sample.type_as(noise)
