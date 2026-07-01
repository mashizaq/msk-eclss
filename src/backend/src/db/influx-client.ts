import { InfluxDB, WritePrecision, WriteApi, QueryApi } from '@influxdata/influxdb-client';
import { logger } from '../utils/logger';

const INFLUX_URL = process.env.INFLUX_URL || 'http://localhost:8086';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || 'dev-token';
const INFLUX_ORG = process.env.INFLUX_ORG || 'mars-society-kenya';
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'eclss-telemetry';

let influxDB: InfluxDB;
let writeApi: WriteApi;
let queryApi: QueryApi;

export async function initInfluxDB(): Promise<void> {
  try {
    influxDB = new InfluxDB({
      url: INFLUX_URL,
      token: INFLUX_TOKEN,
    });

    writeApi = influxDB.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, WritePrecision.ms);
    writeApi.useDefaultTags({ region: 'oaseas-habitat', system: 'eclss' });

    queryApi = influxDB.getQueryApi(INFLUX_ORG);

    // Test connection
    await queryApi.collectRows('from(bucket: "' + INFLUX_BUCKET + '") |> range(start: -1m) |> limit(n:1)');
    logger.info('✅ InfluxDB connected successfully');
  } catch (error) {
    logger.error('Failed to initialize InfluxDB', { error });
    throw error;
  }
}

export function getInfluxWriteApi(): WriteApi {
  return writeApi;
}

export function getInfluxQueryApi(): QueryApi {
  return queryApi;
}

export async function queryTelemetry(
  measurement: string,
  range: string = '-1h'
): Promise<any[]> {
  try {
    const fluxQuery = `
      from(bucket: "${INFLUX_BUCKET}")
        |> range(start: ${range})
        |> filter(fn: (r) => r._measurement == "${measurement}")
        |> sort(columns: ["_time"], desc: false)
    `;

    const data: any[] = [];
    await queryApi.queryRows(fluxQuery, {
      next(row: string[], tableMeta: any) {
        const o = tableMeta.toObject(row);
        data.push(o);
      },
      error(error: any) {
        logger.error('InfluxDB query error', { error });
      },
      complete() {
        logger.debug(`Query completed, ${data.length} rows returned`);
      },
    });

    return data;
  } catch (error) {
    logger.error('Failed to query telemetry', { error });
    return [];
  }
}
