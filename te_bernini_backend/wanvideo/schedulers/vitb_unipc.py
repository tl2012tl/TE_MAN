from diffusers.schedulers import UniPCMultistepScheduler
import torch


class ViBTScheduler(UniPCMultistepScheduler):
    def __init__(self, **kwargs):
        super().__init__(**{**kwargs, "use_flow_sigmas": True})
        self.set_parameters()

    def set_parameters(self, noise_scale=1.0, shift=5.0, seed=None):
        self.noise_scale = noise_scale
        self.config.flow_shift = shift

    def step(self, model_output, timestep, sample, generator, **kwargs):
        delta_t = (
            max(self.timesteps[self.timesteps < timestep]) - timestep
            if any(self.timesteps < timestep)
            else -timestep - 1
        ) / 1000

        current_t = (timestep + 1) / 1000.0
        eta = (-delta_t * (current_t + delta_t) / current_t) ** 0.5

        noise = torch.randn(
            sample.shape,
            generator=generator,
            device=torch.device("cpu"),
            dtype=sample.dtype,
        ).to(sample.device)
        latents = sample + delta_t * model_output + eta * self.noise_scale * noise

        return (latents,)

    @classmethod
    def from_scheduler(
        cls, scheduler: UniPCMultistepScheduler, noise_scale=1.0, shift_gamma=5.0
    ):
        obj = cls.__new__(cls)
        obj.__dict__ = scheduler.__dict__.copy()
        obj.set_parameters(noise_scale, shift_gamma)
        return obj