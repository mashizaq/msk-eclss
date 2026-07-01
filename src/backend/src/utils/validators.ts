import Joi from 'joi';

export const telemetrySchema = Joi.object({
  system: Joi.string().valid('digesters', 'ro', 'biogas', 'pump').required(),
  metric: Joi.string().required(),
  value: Joi.number().required(),
  unit: Joi.string().optional(),
  timestamp: Joi.number().optional(),
});

export const setpointSchema = Joi.object({
  system: Joi.string().valid('digesters', 'ro', 'system').required(),
  parameter: Joi.string().required(),
  value: Joi.number().required(),
});

export const manualOverrideSchema = Joi.object({
  component: Joi.string().required(),
  command: Joi.string().required(),
  args: Joi.object().optional(),
});
