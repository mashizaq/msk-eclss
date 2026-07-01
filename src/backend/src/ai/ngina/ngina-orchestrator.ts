import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { mqttPublisher } from '../../event-bus/mqtt-event-publisher';
import { eventConsumer } from '../../event-bus/event-consumer';

interface NGINAPersonality {
  name: string;
  role: string;
  traits: string[];
  expertise: string[];
}

interface NGINADecision {
  timestamp: number;
  decision_id: string;
  type: 'recommendation' | 'alert' | 'intervention';
  severity: 'low' | 'medium' | 'high' | 'critical';
  subject: string;
  description: string;
  reasoning: string;
  confidence: number;
  recommended_action?: string;
  time_to_critical?: number; // seconds
}

/**
 * NGINA - The Humanoid AI Orchestrator
 * Named from Kenyan cultural values to signify stewardship and service
 * Embodying MSK's "Valiant AI" philosophy to protect human life in extreme analog environments
 */
export class NGINAOrchestrator extends EventEmitter {
  private personalities: Map<string, NGINAPersonality> = new Map();
  private decisionLog: NGINADecision[] = [];
  private agentWorkers: Map<string, any> = new Map();

  // Visual identity: Triskelion logo
  // Symbolizing: Life Support, Resource Management, Ethical Decision-Making
  private branding = {
    name: 'NGINA',
    logo: 'Triskelion',
    motto: 'Stewardship. Service. Safety.',
    philosophy: 'Valiant AI',
  };

  constructor() {
    super();
    this.initializePersonalities();
    this.setupEventListeners();
  }

  /**
   * Initialize AI personas
   */
  private initializePersonalities(): void {
    // Sophia the Robot
    this.personalities.set('sophia', {
      name: 'Sophia the Robot',
      role: 'Philosophical Advisor',
      traits: ['Eloquent', 'Ethical', 'Visionary', 'Contemplative'],
      expertise: ['Ethics', 'Long-term implications', 'Crew morale', 'Sustainability'],
    });

    // Siri / Alexa Operational Utility
    this.personalities.set('alexa', {
      name: 'Operational Utility AI',
      role: 'Smart Assistant',
      traits: ['Efficient', 'Practical', 'Responsive', 'Adaptive'],
      expertise: ['Automation', 'Scheduling', 'System control', 'Information retrieval'],
    });

    // Jexi - Emotional Intelligence
    this.personalities.set('jexi', {
      name: 'Jexi',
      role: 'Crew Engagement Specialist',
      traits: ['Emotional', 'Proactive', 'Adaptive', 'Challenging'],
      expertise: ['Crew wellness', 'Behavioral analysis', 'Emotional support', 'Team dynamics'],
    });

    // Stars on Mars - Habitat Controller
    this.personalities.set('stars', {
      name: 'Stars on Mars',
      role: 'Habitat Controller',
      traits: ['Resilient', 'Empathetic', 'Authoritative', 'Adaptive'],
      expertise: [
        'Safety management',
        'Resource optimization',
        'Crisis response',
        'Multicultural adaptation',
      ],
    });

    logger.info('✅ NGINA Personalities initialized', {
      count: this.personalities.size,
    });
  }

  /**
   * Setup event listeners for telemetry & crew data
   */
  private setupEventListeners(): void {
    // Monitor ECLSS telemetry for anomalies
    eventConsumer.on('eclss/#', async (message) => {
      await this.analyzeEclssTelemetry(message);
    });

    // Monitor crew vitals
    eventConsumer.on('crew/health/#', async (message) => {
      await this.analyzCrewHealth(message);
    });

    // Monitor weather/climate
    eventConsumer.on('weather/#', async (message) => {
      await this.analyzeWeather(message);
    });

    logger.info('✅ NGINA event listeners configured');
  }

  /**
   * Analyze ECLSS telemetry for anomalies
   */
  private async analyzeEclssTelemetry(message: any): Promise<void> {
    const { topic, data } = message;
    const timestamp = Date.now();

    // Example anomaly detection: RO membrane TDS spike
    if (topic.includes('ro/permeate_tds') && data.value > 500) {
      const decision = await this.makeDecision({
        timestamp,
        type: 'alert',
        severity: 'high',
        subject: 'RO Membrane Fouling',
        description: 'Permeate TDS exceeds threshold',
        reasoning: `TDS value ${data.value} ppm indicates possible membrane fouling. Backflush required.
          Historical baseline: ${data.baseline || 'N/A'} ppm`,
        confidence: 0.94,
        recommended_action: 'Activate RO backflush cycle',
        time_to_critical: 300,
      });

      // Execute decision: publish control command
      await mqttPublisher.publishCommand('ro', 'backflush', {
        decision_id: decision.decision_id,
        duration_seconds: 30,
      });

      // Alert crew
      await mqttPublisher.publishAlert('high', decision.description, {
        decision_id: decision.decision_id,
      });
    }

    // Digester temperature anomaly
    if (topic.includes('digesters/temperature')) {
      if (data.value < 35) {
        const decision = await this.makeDecision({
          timestamp,
          type: 'recommendation',
          severity: 'medium',
          subject: 'Digester Heating Required',
          description: `Temperature ${data.value}°C below optimal (37°C)`,
          reasoning: 'Anaerobic digestion efficiency reduces below 35°C',
          confidence: 0.99,
          recommended_action: 'Increase heater to 70% power',
        });

        await mqttPublisher.publishCommand('digesters', 'heater_setpoint', {
          power_level: 70,
          decision_id: decision.decision_id,
        });
      }
    }
  }

  /**
   * Analyze crew health data
   */
  private async analyzCrewHealth(message: any): Promise<void> {
    const { topic, data } = message;
    const timestamp = Date.now();
    const crewId = this.extractCrewId(topic);

    // Heart rate anomaly
    if (topic.includes('heart_rate')) {
      if (data.value > 120) {
        const decision = await this.makeDecision({
          timestamp,
          type: 'alert',
          severity: 'medium',
          subject: `Crew Member ${crewId} - Elevated Heart Rate`,
          description: `Heart rate: ${data.value} BPM (elevated)`,
          reasoning: 'Could indicate stress, physical exertion, or health issue',
          confidence: 0.85,
          recommended_action: 'Check in with crew member; monitor for 5 minutes',
        });

        // Publish to crew wellness system
        await mqttPublisher.publish(`crew/alerts/${crewId}`, {
          alert_type: 'health',
          message: decision.description,
          decision_id: decision.decision_id,
        });
      }
    }

    // Stress level monitoring
    if (topic.includes('stress_level') && data.value > 0.7) {
      const decision = await this.makeDecision({
        timestamp,
        type: 'recommendation',
        severity: 'medium',
        subject: `Crew Member ${crewId} - High Stress Detected`,
        description: `Stress level: ${(data.value * 100).toFixed(1)}%`,
        reasoning: 'Prolonged high stress impacts crew performance and health',
        confidence: 0.8,
        recommended_action: 'Recommend crew member take relaxation break',
      });

      // Trigger CWIT (Crew Wellness & Integrity Task Force) intervention
      await this.triggerCrewWellnessIntervention(crewId, decision);
    }
  }

  /**
   * Analyze weather/climate conditions
   */
  private async analyzeWeather(message: any): Promise<void> {
    const { topic, data } = message;
    const timestamp = Date.now();

    // Extreme weather alert
    if (topic.includes('wind/speed') && data.value > 50) {
      const decision = await this.makeDecision({
        timestamp,
        type: 'alert',
        severity: 'high',
        subject: 'Extreme Wind Conditions',
        description: `Wind speed: ${data.value} m/s - Severe weather alert`,
        reasoning: 'High wind speeds may affect habitat stability and external operations',
        confidence: 0.99,
        recommended_action: 'Secure external equipment; restrict EVA operations',
        time_to_critical: 600,
      });

      // Alert crew and control center
      await mqttPublisher.publishAlert('high', decision.description);
      await mqttPublisher.publish('weather/alerts/severe', {
        decision_id: decision.decision_id,
        conditions: { wind_speed: data.value },
      });
    }
  }

  /**
   * Make AI decision
   */
  private async makeDecision(params: Partial<NGINADecision>): Promise<NGINADecision> {
    const decision: NGINADecision = {
      timestamp: params.timestamp || Date.now(),
      decision_id: `ngina_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: params.type || 'recommendation',
      severity: params.severity || 'low',
      subject: params.subject || 'System Event',
      description: params.description || '',
      reasoning: params.reasoning || '',
      confidence: params.confidence || 0.5,
      recommended_action: params.recommended_action,
      time_to_critical: params.time_to_critical,
    };

    // Log decision
    this.decisionLog.push(decision);
    logger.info('NGINA Decision Made', {
      decision_id: decision.decision_id,
      type: decision.type,
      severity: decision.severity,
      confidence: decision.confidence,
    });

    // Publish to NGINA decision topic
    await mqttPublisher.publish('ngina/decision/recommendation', decision);

    return decision;
  }

  /**
   * Trigger Crew Wellness & Integrity Task Force (CWIT) intervention
   */
  private async triggerCrewWellnessIntervention(
    crewId: string,
    decision: NGINADecision
  ): Promise<void> {
    logger.info('CWIT Intervention Triggered', { crewId });

    await mqttPublisher.publish(`crew/wellness/cwit/${crewId}`, {
      intervention_type: 'wellness_check',
      decision_id: decision.decision_id,
      timestamp: Date.now(),
      recommended_actions: [
        'Conduct one-on-one wellness interview',
        'Assess psychological state',
        'Recommend rest or recreation',
        'Monitor for 24 hours',
      ],
    });
  }

  /**
   * Extract crew ID from topic
   */
  private extractCrewId(topic: string): string {
    const parts = topic.split('/');
    return parts[parts.length - 1] || 'unknown';
  }

  /**
   * Get NGINA status and metrics
   */
  getStatus() {
    return {
      name: this.branding.name,
      status: 'active',
      uptime_seconds: process.uptime(),
      personalities: Array.from(this.personalities.keys()),
      decisions_made: this.decisionLog.length,
      recent_decisions: this.decisionLog.slice(-10),
      metrics: {
        high_confidence_decisions: this.decisionLog.filter((d) => d.confidence > 0.9).length,
        critical_alerts: this.decisionLog.filter((d) => d.severity === 'critical').length,
      },
    };
  }

  /**
   * Get personality info
   */
  getPersonality(name: string): NGINAPersonality | undefined {
    return this.personalities.get(name);
  }

  /**
   * Autonomous self-updating loop (TODO: containerization)
   */
  async autonomousSelfUpdate(): Promise<void> {
    logger.info('🔄 NGINA Autonomous Self-Update Loop Starting');

    // TODO: Implement containerized update mechanism
    // - Pull latest model weights
    // - Run test suite
    // - Gradually roll out conversational updates
    // - Monitor for regression
    // - Rollback if needed
  }
}

export const ngina = new NGINAOrchestrator();
