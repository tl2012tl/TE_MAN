# based on https://github.com/NVlabs/rcm
import torch
import math

class rCMFlowMatchScheduler():

    def __init__(self, num_inference_steps=4, num_train_timesteps=1000, sigma_max=120):
        self.num_train_timesteps = num_train_timesteps
        self.sigma_max = sigma_max
        self.step_index = 0

        self.set_timesteps(num_inference_steps, sigma_max=sigma_max)

    def set_timesteps(self, num_inference_steps=4, sigma_max=120):
        mid_t = [1.5, 1.4, 1.0][:num_inference_steps - 1]
        self.timesteps = torch.tensor([math.atan(sigma_max), *mid_t], dtype=torch.float32)
        self.sigmas = torch.tensor([math.atan(sigma_max), *mid_t, 0], dtype=torch.float32)
        self.step_index = 0

    def step(self, model_output, timestep, sample, generator):

        c_skip = 1 / (torch.cos(timestep) + torch.sin(timestep))
        c_out = -1 * torch.sin(timestep) / (torch.cos(timestep) + torch.sin(timestep))

        # Get next timestep
        if self.step_index + 1 < len(self.sigmas):
            t_next = self.sigmas[self.step_index + 1]
        else:
            t_next = torch.tensor(0.0)

        x = c_skip * sample + c_out * model_output
        if t_next > 1e-5:
            x = torch.cos(t_next) * x + torch.sin(t_next) * torch.randn(
                *x.shape,
                dtype=torch.float32,
                device=torch.device("cpu"),
                generator=generator,
            ).to(x)
        self.step_index += 1
        return x
