import torch



class FlowMatchSchedulerPusa():

    def __init__(self, num_inference_steps=100, num_train_timesteps=1000, shift=3.0, sigma_max=1.0, sigma_min=0.003/1.002, inverse_timesteps=False, extra_one_step=False, reverse_sigmas=False):
        self.num_train_timesteps = num_train_timesteps
        self.shift = shift
        self.sigma_max = sigma_max
        self.sigma_min = sigma_min
        self.inverse_timesteps = inverse_timesteps
        self.extra_one_step = extra_one_step
        self.reverse_sigmas = reverse_sigmas
        #self.set_timesteps(num_inference_steps)


    def set_timesteps(self, num_inference_steps=100, denoising_strength=1.0, training=False, shift=None, sigmas=None):
        if shift is not None:
            self.shift = shift
        sigma_start = self.sigma_min + (self.sigma_max - self.sigma_min) * denoising_strength
        if sigmas is None:
            steps = num_inference_steps
            if self.extra_one_step:
                self.sigmas = torch.linspace(sigma_start, self.sigma_min, steps)[:-1]
            else:
                self.sigmas = torch.linspace(sigma_start, self.sigma_min, steps)
            if self.inverse_timesteps:
                self.sigmas = torch.flip(self.sigmas, dims=[0])
        else:
            self.sigmas = torch.tensor(sigmas, dtype=torch.float32)
        self.sigmas = self.shift * self.sigmas / (1 + (self.shift - 1) * self.sigmas)
        if self.reverse_sigmas:
            self.sigmas = 1 - self.sigmas
        self.timesteps = self.sigmas * self.num_train_timesteps
        if training:
            x = self.timesteps
            y = torch.exp(-2 * ((x - num_inference_steps / 2) / num_inference_steps) ** 2)
            y_shifted = y - y.min()
            bsmntw_weighing = y_shifted * (num_inference_steps / y_shifted.sum())
            self.linear_timesteps_weights = bsmntw_weighing


    def step(self, model_output, timestep, sample, to_final=False, cond_frame_latent_indices=None, noise_multipliers=None, **kwargs):
        if isinstance(timestep, torch.Tensor):
            self.timesteps = self.timesteps.to(timestep.device)
            self.sigmas = self.sigmas.to(timestep.device)
            model_output = model_output.to(timestep.device)
            sample = sample.to(timestep.device)
        if len(timestep.shape) == 1:
            timestep_id = torch.argmin((self.timesteps - timestep).abs())
            sigma = self.sigmas[timestep_id]
            if timestep_id + 1 < len(self.sigmas):
                sigma_ = self.sigmas[timestep_id + 1]
            else:
                sigma_ = 0.0  # Only zero at the true end
            # Zero sigma and sigma_ for indices where timestep == 0
            if torch.any(timestep == 0):
                sigma = torch.where(timestep == 0, torch.zeros_like(sigma), sigma)
                sigma_ = torch.where(timestep == 0, torch.zeros_like(sigma_), sigma_)
            prev_sample = sample + model_output * (sigma_ - sigma)
        else:
            timestep_full = timestep.clone()
            timestep_id = torch.argmin((self.timesteps.unsqueeze(1) - timestep).abs(), dim=0)
            sigma = self.sigmas[timestep_id].unsqueeze(0).unsqueeze(1).unsqueeze(3).unsqueeze(4).to(sample.device)
            sigma_ = torch.zeros_like(timestep_id, dtype=self.sigmas.dtype, device=sample.device)
            last_step = (timestep_id == len(self.sigmas) - 1)
            not_last = ~last_step
            sigma_[not_last] = self.sigmas[(timestep_id[not_last] + 1).to(torch.long)]
            sigma_ = sigma_.unsqueeze(0).unsqueeze(1).unsqueeze(3).unsqueeze(4).to(sample.device)

            # noise multipliers
            if cond_frame_latent_indices is not None and noise_multipliers is not None:
                for latent_idx in cond_frame_latent_indices:
                    if timestep_full[:, latent_idx] == 0:
                        sigma[:, :, latent_idx] = 0
                        sigma_[:, :, latent_idx] = 0
                        continue
                    multiplier = noise_multipliers[latent_idx]
                    sigma[:, :, latent_idx] = sigma[:, :, latent_idx] * multiplier
                    sigma_[:, :, latent_idx] = sigma_[:, :, latent_idx] * multiplier

            # Zero sigma and sigma_ for batch indices where timestep == 0
            zero_indices = (timestep[0] == 0).nonzero(as_tuple=True)[0]
            if zero_indices.numel() > 0:
                sigma[:,:,zero_indices,:,:] = 0
                sigma_[:,:,zero_indices,:,:] = 0
            #print("sigma", sigma[0,0,:,0,0], '\n', "sigma_", sigma_[0,0,:,0,0])
            prev_sample = sample + model_output * (sigma_ - sigma)
        return prev_sample
    

    def return_to_timestep(self, timestep, sample, sample_stablized):
        if isinstance(timestep, torch.Tensor):
            # timestep = timestep.cpu()
            self.timesteps = self.timesteps.to(timestep.device)
            self.sigmas = self.sigmas.to(timestep.device)
        if len(timestep.shape) == 1:
            timestep_id = torch.argmin((self.timesteps - timestep).abs())
            sigma = self.sigmas[timestep_id]
        else:
            timestep_id = torch.argmin((self.timesteps.unsqueeze(1) - timestep).abs(), dim=0)
            sigma = self.sigmas[timestep_id].unsqueeze(0).unsqueeze(1).unsqueeze(3).unsqueeze(4).to(sample.device)
        model_output = (sample - sample_stablized) / sigma
        return model_output
    
    
    def add_noise(self, original_samples, noise, timestep):
        if isinstance(timestep, torch.Tensor):
            # timestep = timestep.cpu()
            self.timesteps = self.timesteps.to(timestep.device)
            self.sigmas = self.sigmas.to(timestep.device)
        if len(timestep.shape) == 1:
            timestep_id = torch.argmin((self.timesteps - timestep).abs())
            sigma = self.sigmas[timestep_id]
        else:
            timestep_id = torch.argmin((self.timesteps.unsqueeze(1) - timestep).abs(), dim=0)
            sigma = self.sigmas[timestep_id].unsqueeze(0).unsqueeze(1).unsqueeze(3).unsqueeze(4).to(original_samples.device)
        sample = (1 - sigma) * original_samples + sigma * noise
        
        return sample
    
    def add_noise_for_conditioning_frames(self, original_samples, noise, timestep, noise_multiplier=None):
        if isinstance(timestep, torch.Tensor):
            self.timesteps = self.timesteps.to(timestep.device)
            self.sigmas = self.sigmas.to(timestep.device)
        if len(timestep.shape) == 1:
            timestep_id = torch.argmin((self.timesteps - timestep).abs())
            sigma = self.sigmas[timestep_id]
        else:
            timestep_id = torch.argmin((self.timesteps.unsqueeze(1) - timestep).abs(), dim=0)
            sigma = self.sigmas[timestep_id].unsqueeze(0).unsqueeze(1).unsqueeze(3).unsqueeze(4).to(original_samples.device)            
            sigma= sigma * noise_multiplier # timestep = sigma * 1000, equivalent, so directly use multiplier here
        
        sample = (1 - sigma) * original_samples + sigma * noise

        #print("add noise sigma:", sigma,"noise_multiplier:", noise_multiplier, "timestep:", timestep)

        return sample
    

    def training_target(self, sample, noise, timestep):
        target = noise - sample
        return target
    

    def training_weight(self, timestep):
        if isinstance(timestep, torch.Tensor):
            self.timesteps = self.timesteps.to(timestep.device)
            self.linear_timesteps_weights = self.linear_timesteps_weights.to(timestep.device)
        if len(timestep.shape) == 1:
            timestep_id = torch.argmin((self.timesteps - timestep.to(self.timesteps.device)).abs())
        else:
            timestep_id = torch.argmin((self.timesteps.unsqueeze(1) - timestep.to(self.timesteps.device)).abs(), dim=0) 
        weights = self.linear_timesteps_weights[timestep_id].to(self.timesteps.device)
        return weights