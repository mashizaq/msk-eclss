import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { mqttPublisher } from '../../event-bus/mqtt-event-publisher';
import { eventConsumer } from '../../event-bus/event-consumer';

interface CrewMember {
  crew_id: string;
  name: string;
  role: string;
  status: 'active' | 'rest' | 'medical' | 'away';
  joined_at: number;
  removed_at?: number;
  health_metrics: {
    heart_rate: number;
    oxygen_saturation: number;
    body_temperature: number;
    stress_level: number;
  };
  location?: {
    zone: string;
    x: number;
    y: number;
    z: number;
  };
}

interface CrewLog {
  timestamp: number;
  crew_id: string;
  log_type: 'activity' | 'health' | 'wellness' | 'incident';
  description: string;
  metadata?: any;
}

interface CrewWellnessAssessment {
  timestamp: number;
  crew_id: string;
  physical_score: number; // 0-100
  psychological_score: number; // 0-100
  behavioral_score: number; // 0-100
  overall_wellness: number; // 0-100
  recommendations: string[];
}

/**
 * Crew AI System
 * Manages crew health, wellness, behavioral monitoring
 * Integrates SHATC program: CWIT (Wellness/Integrity) + BLET (Behavioral Excellence)
 */
export class CrewAISystem extends EventEmitter {
  private crew: Map<string, CrewMember> = new Map();
  private crewLogs: CrewLog[] = [];
  private wellnessAssessments: Map<string, CrewWellnessAssessment> = new Map();

  // SHATC Task Forces
  private cwit = {
    name: 'Crew Wellness & Integrity Task Force',
    focus: ['Physical health', 'Mental health', 'Psychological integrity', 'Safety'],
  };

  private blet = {
    name: 'Behavioral & Lifestyle Excellence Task Force',
    focus: ['Behavior optimization', 'Lifestyle adaptation', 'Team dynamics', 'Performance'],
  };

  constructor() {
    super();
    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for crew health updates
    eventConsumer.on('crew/health/#', async (message) => {
      await this.processHealthUpdate(message);
    });

    // Listen for crew activity logs
    eventConsumer.on('crew/activity/#', async (message) => {
      await this.logCrewActivity(message);
    });

    // Listen for wellness interventions
    eventConsumer.on('crew/wellness/#', async (message) => {
      await this.processWellnessIntervention(message);
    });

    logger.info('✅ Crew AI System initialized');
  }

  /**
   * Add crew member to habitat
   */
  async addCrewMember(
    crewId: string,
    name: string,
    role: string
  ): Promise<void> {
    const member: CrewMember = {
      crew_id: crewId,
      name,
      role,
      status: 'active',
      joined_at: Date.now(),
      health_metrics: {
        heart_rate: 0,
        oxygen_saturation: 0,
        body_temperature: 0,
        stress_level: 0,
      },
    };

    this.crew.set(crewId, member);

    // Publish crew joined event
    await mqttPublisher.publish('crew/log/joined', {
      crew_id: crewId,
      name,
      role,
      joined_at: member.joined_at,
    });

    // Log event
    await this.logEvent('crew_joined', crewId, `${name} joined the habitat`);

    logger.info('Crew member added', { crewId, name, role });
  }

  /**
   * Remove crew member from habitat
   */
  async removeCrewMember(crewId: string, reason?: string): Promise<void> {
    const member = this.crew.get(crewId);
    if (!member) {
      logger.warn('Crew member not found', { crewId });
      return;
    }

    member.status = 'away';
    member.removed_at = Date.now();

    // Publish crew left event
    await mqttPublisher.publish('crew/log/left', {
      crew_id: crewId,
      name: member.name,
      removed_at: member.removed_at,
      reason: reason || 'Unknown',
    });

    // Log event
    await this.logEvent('crew_left', crewId, `${member.name} left the habitat: ${reason || 'N/A'}`);

    logger.info('Crew member removed', { crewId, reason });
  }

  /**
   * Process health update from crew vitals
   */
  private async processHealthUpdate(message: any): Promise<void> {
    const { topic, data } = message;
    const crewId = this.extractCrewId(topic);
    const member = this.crew.get(crewId);

    if (!member) return;

    // Update health metrics
    if (topic.includes('heart_rate')) {
      member.health_metrics.heart_rate = data.value;
    } else if (topic.includes('oxygen_saturation')) {
      member.health_metrics.oxygen_saturation = data.value;
    } else if (topic.includes('body_temperature')) {
      member.health_metrics.body_temperature = data.value;
    } else if (topic.includes('stress_level')) {
      member.health_metrics.stress_level = data.value;
    }

    // Log health update
    await this.logEvent('health_update', crewId, `Health metrics updated: ${JSON.stringify(data)}`);

    // Check health thresholds
    await this.assessCrewHealth(crewId, member);
  }

  /**
   * Assess crew member health and generate wellness score
   */
  private async assessCrewHealth(crewId: string, member: CrewMember): Promise<void> {
    const { heart_rate, oxygen_saturation, body_temperature, stress_level } =
      member.health_metrics;

    // Calculate physical health score (0-100)
    let physicalScore = 100;
    if (heart_rate > 100) physicalScore -= 10;
    if (heart_rate > 120) physicalScore -= 10;
    if (oxygen_saturation < 95) physicalScore -= 20;
    if (body_temperature < 36.5 || body_temperature > 37.5) physicalScore -= 15;
    physicalScore = Math.max(0, Math.min(100, physicalScore));

    // Calculate psychological score based on stress
    let psychScore = 100 - (stress_level * 100 || 0);
    psychScore = Math.max(0, Math.min(100, psychScore));

    // Behavioral score (TODO: integrate with BLET tracking)
    let behavioralScore = 80; // Placeholder

    // Overall wellness
    const overallWellness = (physicalScore + psychScore + behavioralScore) / 3;

    // Store assessment
    const assessment: CrewWellnessAssessment = {
      timestamp: Date.now(),
      crew_id: crewId,
      physical_score: physicalScore,
      psychological_score: psychScore,
      behavioral_score: behavioralScore,
      overall_wellness: overallWellness,
      recommendations: this.generateWellnessRecommendations(
        physicalScore,
        psychScore,
        behavioralScore
      ),
    };

    this.wellnessAssessments.set(crewId, assessment);

    // Publish assessment
    await mqttPublisher.publish(`crew/wellness/assessment/${crewId}`, assessment);

    // Alert CWIT if critical
    if (overallWellness < 50) {
      await mqttPublisher.publishAlert(
        'high',
        `Critical wellness issue for crew member ${member.name}`,
        { crew_id: crewId, assessment }
      );

      // Trigger CWIT intervention
      await this.triggerCWITIntervention(crewId, assessment);
    }
  }

  /**
   * Generate wellness recommendations based on scores
   */
  private generateWellnessRecommendations(
    physical: number,
    psychological: number,
    behavioral: number
  ): string[] {
    const recommendations: string[] = [];

    if (physical < 70) {
      recommendations.push('Immediate medical check-up recommended');
      recommendations.push('Monitor vital signs closely');
    }

    if (psychological < 60) {
      recommendations.push('Schedule counseling session');
      recommendations.push('Recommend rest and relaxation');
      recommendations.push('Consider rotation to less demanding tasks');
    }

    if (behavioral < 70) {
      recommendations.push('BLET team review recommended');
      recommendations.push('Team building activity suggested');
    }

    if (recommendations.length === 0) {
      recommendations.push('Continue routine monitoring');
      recommendations.push('Maintain current activity level');
    }

    return recommendations;
  }

  /**
   * Trigger CWIT (Crew Wellness & Integrity) intervention
   */
  private async triggerCWITIntervention(
    crewId: string,
    assessment: CrewWellnessAssessment
  ): Promise<void> {
    logger.warn('CWIT Intervention Required', { crewId });

    await mqttPublisher.publish(`crew/wellness/cwit/intervention`, {
      crew_id: crewId,
      assessment,
      intervention_timestamp: Date.now(),
      task_force: this.cwit.name,
      actions: [
        'Priority medical evaluation',
        'Psychological assessment',
        'Determine fitness for duty',
        'Establish recovery plan',
      ],
    });
  }

  /**
   * Log crew activity
   */
  private async logCrewActivity(message: any): Promise<void> {
    const { topic, data } = message;
    const crewId = this.extractCrewId(topic);

    const log: CrewLog = {
      timestamp: Date.now(),
      crew_id: crewId,
      log_type: 'activity',
      description: data.description || 'Activity logged',
      metadata: data,
    };

    this.crewLogs.push(log);

    logger.debug('Crew activity logged', { crewId, description: log.description });
  }

  /**
   * Log event
   */
  private async logEvent(
    logType: string,
    crewId: string,
    description: string
  ): Promise<void> {
    const log: CrewLog = {
      timestamp: Date.now(),
      crew_id: crewId,
      log_type: logType as any,
      description,
    };

    this.crewLogs.push(log);

    // Publish to crew log topic
    await mqttPublisher.publish(`crew/log/event/${crewId}`, log);
  }

  /**
   * Process wellness intervention
   */
  private async processWellnessIntervention(message: any): Promise<void> {
    // TODO: Handle BLET interventions and update crew status
    logger.info('Wellness intervention received', message);
  }

  /**
   * Get crew member status
   */
  getCrewMember(crewId: string): CrewMember | undefined {
    return this.crew.get(crewId);
  }

  /**
   * Get all crew members
   */
  getAllCrew(): CrewMember[] {
    return Array.from(this.crew.values()).filter((member) => !member.removed_at);
  }

  /**
   * Get crew wellness summary
   */
  getCrewWellnessSummary() {
    const crew = this.getAllCrew();
    const assessments = Array.from(this.wellnessAssessments.values()).filter((a) =>
      crew.some((c) => c.crew_id === a.crew_id)
    );

    return {
      total_crew: crew.length,
      active_crew: crew.filter((c) => c.status === 'active').length,
      assessments,
      average_wellness: assessments.length > 0
        ? assessments.reduce((sum, a) => sum + a.overall_wellness, 0) / assessments.length
        : 0,
    };
  }

  /**
   * Get crew logs (with filtering)
   */
  getCrewLogs(
    crewId?: string,
    logType?: string,
    since?: number
  ): CrewLog[] {
    return this.crewLogs.filter((log) => {
      if (crewId && log.crew_id !== crewId) return false;
      if (logType && log.log_type !== logType) return false;
      if (since && log.timestamp < since) return false;
      return true;
    });
  }

  /**
   * Extract crew ID from topic
   */
  private extractCrewId(topic: string): string {
    const parts = topic.split('/');
    return parts[parts.length - 1] || 'unknown';
  }
}

export const crewAI = new CrewAISystem();
