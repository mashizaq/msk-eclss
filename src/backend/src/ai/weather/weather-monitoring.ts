import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { mqttPublisher } from '../../event-bus/mqtt-event-publisher';
import { eventConsumer } from '../../event-bus/event-consumer';

interface WeatherCondition {
  timestamp: number;
  atmospheric_pressure: number; // hPa
  temperature: number; // Celsius
  humidity: number; // %
  wind_speed: number; // m/s
  wind_direction: number; // degrees
  solar_radiation: number; // W/m²
  visibility: number; // km
  precipitation: number; // mm/h
}

interface WeatherAlert {
  timestamp: number;
  alert_id: string;
  alert_type: 'wind' | 'temperature' | 'dust_storm' | 'solar_flare' | 'pressure';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  recommended_actions: string[];
}

interface WeatherTrend {
  parameter: string;
  current_value: number;
  trend: 'stable' | 'increasing' | 'decreasing';
  rate_of_change: number; // units per hour
  forecast_1h: number;
  forecast_6h: number;
}

/**
 * Weather/Climate Monitoring System
 * Monitors Martian atmospheric conditions and predicts habitat impacts
 */
export class WeatherMonitoring extends EventEmitter {
  private currentConditions: WeatherCondition | null = null;
  private weatherHistory: WeatherCondition[] = [];
  private activeAlerts: Map<string, WeatherAlert> = new Map();
  private maxHistorySize: number = 1000;

  // Thresholds for alerts
  private thresholds = {
    wind_speed_high: 15, // m/s
    wind_speed_critical: 25, // m/s
    pressure_drop: 5, // hPa in 1 hour
    temperature_extreme_cold: -100, // Celsius
    temperature_extreme_hot: 50, // Celsius
    solar_radiation_high: 2000, // W/m²
    visibility_low: 1, // km
    dust_optical_depth: 3.0, // optical depth
  };

  constructor() {
    super();
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for weather data
   */
  private setupEventListeners(): void {
    eventConsumer.on('weather/#', async (message) => {
      await this.processWeatherUpdate(message);
    });

    logger.info('✅ Weather Monitoring System initialized');
  }

  /**
   * Process incoming weather telemetry
   */
  private async processWeatherUpdate(message: any): Promise<void> {
    const { topic, data } = message;

    // Update current conditions based on topic
    if (!this.currentConditions) {
      this.currentConditions = {
        timestamp: Date.now(),
        atmospheric_pressure: 0,
        temperature: 0,
        humidity: 0,
        wind_speed: 0,
        wind_direction: 0,
        solar_radiation: 0,
        visibility: 0,
        precipitation: 0,
      };
    }

    if (topic.includes('atmospheric/pressure')) {
      this.currentConditions.atmospheric_pressure = data.value;
      await this.checkPressureTrend();
    } else if (topic.includes('atmospheric/temperature')) {
      this.currentConditions.temperature = data.value;
      await this.checkTemperatureExtremes();
    } else if (topic.includes('atmospheric/humidity')) {
      this.currentConditions.humidity = data.value;
    } else if (topic.includes('wind/speed')) {
      this.currentConditions.wind_speed = data.value;
      await this.checkWindConditions();
    } else if (topic.includes('wind/direction')) {
      this.currentConditions.wind_direction = data.value;
    } else if (topic.includes('solar/radiation')) {
      this.currentConditions.solar_radiation = data.value;
      await this.checkSolarRadiation();
    } else if (topic.includes('visibility')) {
      this.currentConditions.visibility = data.value;
      await this.checkVisibility();
    } else if (topic.includes('precipitation')) {
      this.currentConditions.precipitation = data.value;
    }

    // Store in history
    this.updateHistory();

    // Publish update to UI
    await mqttPublisher.publish('weather/update', this.currentConditions);
  }

  /**
   * Check wind conditions for alerts
   */
  private async checkWindConditions(): Promise<void> {
    if (!this.currentConditions) return;

    const windSpeed = this.currentConditions.wind_speed;

    if (windSpeed >= this.thresholds.wind_speed_critical) {
      await this.publishAlert({
        alert_type: 'wind',
        severity: 'critical',
        description: `Critical wind speed: ${windSpeed.toFixed(1)} m/s (${(windSpeed * 3.6).toFixed(1)} km/h)`,
        impact: 'Severe threat to habitat stability and external systems',
        recommended_actions: [
          'Secure all external equipment',
          'Activate wind bracing systems',
          'Prohibit EVA operations',
          'Monitor structural integrity',
          'Alert Mission Control',
        ],
      });
    } else if (windSpeed >= this.thresholds.wind_speed_high) {
      await this.publishAlert({
        alert_type: 'wind',
        severity: 'high',
        description: `High wind speed: ${windSpeed.toFixed(1)} m/s`,
        impact: 'Potential threat to external operations and equipment',
        recommended_actions: [
          'Restrict EVA activities',
          'Secure loose external items',
          'Monitor wind trends',
        ],
      });
    } else {
      // Clear wind alerts if speed drops below threshold
      this.activeAlerts.delete('wind');
    }
  }

  /**
   * Check temperature extremes
   */
  private async checkTemperatureExtremes(): Promise<void> {
    if (!this.currentConditions) return;

    const temp = this.currentConditions.temperature;

    if (temp <= this.thresholds.temperature_extreme_cold) {
      await this.publishAlert({
        alert_type: 'temperature',
        severity: 'critical',
        description: `Extreme cold: ${temp.toFixed(1)}°C`,
        impact: 'Risk to habitat insulation and crew safety during EVA',
        recommended_actions: [
          'Increase internal heating',
          'EVA suits require cold-weather upgrades',
          'Increase thermal insulation monitoring',
        ],
      });
    } else if (temp >= this.thresholds.temperature_extreme_hot) {
      await this.publishAlert({
        alert_type: 'temperature',
        severity: 'high',
        description: `Extreme heat: ${temp.toFixed(1)}°C`,
        impact: 'Heat stress risk; ECLSS cooling system strain',
        recommended_actions: [
          'Maximize ECLSS cooling capacity',
          'Reduce internal heat-generating activities',
          'Monitor crew hydration',
        ],
      });
    }
  }

  /**
   * Check pressure trend for dust storms
   */
  private async checkPressureTrend(): Promise<void> {
    if (!this.currentConditions || this.weatherHistory.length < 2) return;

    const recent = this.weatherHistory[this.weatherHistory.length - 2];
    const pressureDrop = recent.atmospheric_pressure - this.currentConditions.atmospheric_pressure;

    if (Math.abs(pressureDrop) > this.thresholds.pressure_drop) {
      await this.publishAlert({
        alert_type: 'dust_storm',
        severity: 'high',
        description: `Rapid pressure change detected: ${pressureDrop.toFixed(1)} hPa drop`,
        impact: 'Possible dust storm formation or pressure system movement',
        recommended_actions: [
          'Activate dust storm protocols',
          'Increase air filtration',
          'Secure airlocks and seals',
          'Monitor visibility',
        ],
      });
    }
  }

  /**
   * Check solar radiation levels
   */
  private async checkSolarRadiation(): Promise<void> {
    if (!this.currentConditions) return;

    const solarRad = this.currentConditions.solar_radiation;

    if (solarRad > this.thresholds.solar_radiation_high) {
      await this.publishAlert({
        alert_type: 'solar_flare',
        severity: 'medium',
        description: `High solar radiation: ${solarRad.toFixed(0)} W/m²`,
        impact: 'Increased cosmic radiation exposure; potential equipment interference',
        recommended_actions: [
          'Increase radiation shielding monitoring',
          'Minimize EVA duration',
          'Monitor crew radiation exposure',
          'Check satellite communications',
        ],
      });
    }
  }

  /**
   * Check visibility for dust storms
   */
  private async checkVisibility(): Promise<void> {
    if (!this.currentConditions) return;

    const visibility = this.currentConditions.visibility;

    if (visibility < this.thresholds.visibility_low) {
      await this.publishAlert({
        alert_type: 'dust_storm',
        severity: 'high',
        description: `Low visibility: ${visibility.toFixed(2)} km (dust storm in progress)`,
        impact: 'Severely reduced external operations capability',
        recommended_actions: [
          'Prohibit EVA operations',
          'Activate external dust suppression',
          'Activate exterior lighting',
          'Prepare for extended indoor operations',
        ],
      });
    }
  }

  /**
   * Publish weather alert
   */
  private async publishAlert(alert: Omit<WeatherAlert, 'timestamp' | 'alert_id'>): Promise<void> {
    const weatherAlert: WeatherAlert = {
      timestamp: Date.now(),
      alert_id: `weather_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...alert,
    };

    // Store alert
    this.activeAlerts.set(alert.alert_type, weatherAlert);

    // Publish to MQTT
    await mqttPublisher.publishAlert(alert.severity, weatherAlert.description, {
      alert_id: weatherAlert.alert_id,
      alert_type: alert.alert_type,
      actions: alert.recommended_actions,
    });

    // Also publish to weather-specific topic
    await mqttPublisher.publish(`weather/alerts/${alert.alert_type}`, weatherAlert);

    logger.warn('Weather Alert Published', {
      alert_type: alert.alert_type,
      severity: alert.severity,
    });
  }

  /**
   * Update weather history
   */
  private updateHistory(): void {
    if (!this.currentConditions) return;

    this.weatherHistory.push({ ...this.currentConditions });

    // Keep history size bounded
    if (this.weatherHistory.length > this.maxHistorySize) {
      this.weatherHistory.shift();
    }
  }

  /**
   * Get weather trends
   */
  getWeatherTrends(): WeatherTrend[] {
    if (this.weatherHistory.length < 2 || !this.currentConditions) return [];

    const trends: WeatherTrend[] = [];
    const now = this.weatherHistory[this.weatherHistory.length - 1];
    const oneHourAgo = this.weatherHistory[Math.max(0, this.weatherHistory.length - 120)]; // Assuming 30s updates

    const compareAndTrend = (param: string, current: number, past: number): WeatherTrend => {
      const rateOfChange = (current - past) / (this.weatherHistory.length > 1 ? 1 : 1);
      return {
        parameter: param,
        current_value: current,
        trend: current > past ? 'increasing' : current < past ? 'decreasing' : 'stable',
        rate_of_change: rateOfChange,
        forecast_1h: current + (rateOfChange * 2), // Simple linear extrapolation
        forecast_6h: current + (rateOfChange * 12),
      };
    };

    trends.push(
      compareAndTrend('temperature', now.temperature, oneHourAgo.temperature),
      compareAndTrend('wind_speed', now.wind_speed, oneHourAgo.wind_speed),
      compareAndTrend('pressure', now.atmospheric_pressure, oneHourAgo.atmospheric_pressure),
      compareAndTrend('solar_radiation', now.solar_radiation, oneHourAgo.solar_radiation)
    );

    return trends;
  }

  /**
   * Get current weather conditions
   */
  getCurrentConditions(): WeatherCondition | null {
    return this.currentConditions;
  }

  /**
   * Get active weather alerts
   */
  getActiveAlerts(): WeatherAlert[] {
    return Array.from(this.activeAlerts.values());
  }
}

export const weatherMonitoring = new WeatherMonitoring();
