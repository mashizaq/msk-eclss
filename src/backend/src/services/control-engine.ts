import { logger } from '../utils/logger';
import { publishMQTT } from '../mqtt/mqtt-client';
import { queryTelemetry } from '../db/influx-client';

interface ProcessState {
  digesters: {
    temperature: number;
    pressure: number;
    ph: number;
    biogas_volume: number;
    status: 'idle' | 'active' | 'maintenance';
  };
  ro: {
    feed_pressure: number;
    permeate_tds: number;
    membrane_status: 'healthy' | 'fouling' | 'failed';
    recovery_rate: number;
  };
  system: {
    water_recycled_liters: number;
    biogas_produced_m3: number;
    waste_reduced_percent: number;
    last_alert?: string;
  };
}

let currentState: ProcessState = {
  digesters: {
    temperature: 37,
    pressure: 0.5,
    ph: 7.0,
    biogas_volume: 0,
    status: 'idle',
  },
  ro: {
    feed_pressure: 15,
    permeate_tds: 50,
    membrane_status: 'healthy',
    recovery_rate: 0.85,
  },
  system: {
    water_recycled_liters: 0,
    biogas_produced_m3: 0,
    waste_reduced_percent: 0,
  },
};

export async function startControlEngine(): Promise<void> {
  logger.info('🎮 Control Engine started');

  // Main control loop - runs every 5 seconds
  setInterval(async () => {
    try {
      await controlCycle();
    } catch (error) {
      logger.error('Control cycle error', { error });
    }
  }, 5000);

  // Telemetry update cycle - runs every 10 seconds
  setInterval(async () => {
    try {
      await updateTelemetry();
    } catch (error) {
      logger.error('Telemetry update error', { error });
    }
  }, 10000);
}

async function controlCycle(): Promise<void> {
  // Fetch latest sensor data
  const digesterData = await queryTelemetry('eclss_digesters', '-5m');
  const roData = await queryTelemetry('eclss_ro', '-5m');

  // Update state
  if (digesterData.length > 0) {
    const latest = digesterData[digesterData.length - 1];
    currentState.digesters.temperature = latest._value;
    logger.debug('Digester temperature update', { temp: latest._value });
  }

  // Execute control logic
  await executeControlLogic();
}

async function executeControlLogic(): Promise<void> {
  const { digesters, ro, system } = currentState;

  // DIGESTER CONTROL
  if (digesters.temperature < 35) {
    logger.warn('Digester temperature too low, activating heater');
    publishMQTT('eclss/control/digesters/heater', { command: 'ON', power_level: 80 });
    currentState.digesters.status = 'active';
  } else if (digesters.temperature > 39) {
    logger.warn('Digester temperature too high, reducing heater');
    publishMQTT('eclss/control/digesters/heater', { command: 'REDUCE', power_level: 30 });
  }

  // pH regulation
  if (digesters.ph < 6.5) {
    logger.warn('Digester pH too acidic, adding buffer');
    publishMQTT('eclss/control/digesters/buffer_pump', { command: 'ON', flow_rate: 0.5 });
  } else if (digesters.ph > 7.5) {
    logger.warn('Digester pH too basic, adding acid');
    publishMQTT('eclss/control/digesters/acid_pump', { command: 'ON', flow_rate: 0.3 });
  }

  // RO MEMBRANE PROTECTION
  if (ro.feed_pressure > 20) {
    logger.warn('RO feed pressure too high, reducing pump');
    publishMQTT('eclss/control/ro/feed_pump', { command: 'REDUCE', speed: 70 });
  } else if (ro.feed_pressure < 10) {
    logger.warn('RO feed pressure too low, increasing pump');
    publishMQTT('eclss/control/ro/feed_pump', { command: 'INCREASE', speed: 90 });
  }

  // PERMEATE QUALITY CHECK
  if (ro.permeate_tds > 500) {
    logger.error('RO permeate TDS too high, possible membrane fouling');
    currentState.ro.membrane_status = 'fouling';
    publishMQTT('eclss/control/ro/backflush', { command: 'ACTIVATE', duration_seconds: 30 });
  }

  // BIOGAS RECOVERY
  if (digesters.biogas_volume > 50) {
    logger.info('Significant biogas accumulated, initiating capture');
    publishMQTT('eclss/control/biogas/compressor', { command: 'ON', target_pressure: 10 });
  }
}

async function updateTelemetry(): Promise<void> {
  // Query historical data for trend analysis
  const digesterData = await queryTelemetry('eclss_digesters', '-24h');

  if (digesterData.length > 0) {
    // Calculate water recycled (mock)
    const avgFlowRate = 2.0; // L/min
    currentState.system.water_recycled_liters += avgFlowRate * 10; // 10 seconds * flow rate

    // Calculate biogas (mock)
    const avgBiogasProduction = 0.5; // m³/day per kg volatile solids
    currentState.system.biogas_produced_m3 += avgBiogasProduction * 10 / (24 * 60 * 60);

    // Calculate waste reduction (mock)
    currentState.system.waste_reduced_percent = 95; // 95% waste recycled
  }

  logger.debug('Telemetry updated', {
    water_recycled: currentState.system.water_recycled_liters,
    biogas_produced: currentState.system.biogas_produced_m3,
  });
}

export function getControlState(): ProcessState {
  return currentState;
}

export async function setSetpoint(system: string, parameter: string, value: number): Promise<void> {
  logger.info('Setpoint change requested', { system, parameter, value });

  // Validate and apply setpoint
  if (system === 'digesters' && parameter === 'temperature') {
    if (value < 30 || value > 45) {
      throw new Error('Invalid temperature setpoint (30-45°C)');
    }
    publishMQTT('eclss/control/digesters/temperature_setpoint', { value });
  } else if (system === 'ro' && parameter === 'feed_pressure') {
    if (value < 5 || value > 25) {
      throw new Error('Invalid pressure setpoint (5-25 bar)');
    }
    publishMQTT('eclss/control/ro/feed_pressure_setpoint', { value });
  }
}
