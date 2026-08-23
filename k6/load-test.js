import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const errorRate = new Rate('errors');
const healthDuration = new Trend('health_duration');
const dataDuration = new Trend('data_duration');
const stressDuration = new Trend('stress_duration');

export const options = {
  scenarios: {
    health_check: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      exec: 'healthCheck',
      tags: { scenario: 'health' },
    },
    data_query: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      exec: 'dataQuery',
      startTime: '5s',
      tags: { scenario: 'data' },
    },
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '10s', target: 10 },
        { duration: '20s', target: 20 },
        { duration: '10s', target: 0 },
      ],
      exec: 'stressTest',
      startTime: '10s',
      tags: { scenario: 'stress' },
    },
  },
  thresholds: {
    errors: ['rate<0.1'],
    health_duration: ['p(95)<500'],
    data_duration: ['p(95)<1000'],
  },
};

export function healthCheck() {
  const res = http.get(`${BASE_URL}/health`);
  healthDuration.add(res.timings.duration);
  const success = check(res, {
    'health status is 200': (r) => r.status === 200,
    'health has ok status': (r) => r.json('status') === 'ok',
  });
  errorRate.add(!success);
  sleep(0.5);
}

export function dataQuery() {
  const res = http.get(`${BASE_URL}/data`);
  dataDuration.add(res.timings.duration);
  const success = check(res, {
    'data status is 200': (r) => r.status === 200,
    'data has db_time': (r) => r.json('db_time') !== undefined,
  });
  errorRate.add(!success);
  sleep(0.5);
}

export function stressTest() {
  const res = http.get(`${BASE_URL}/stress`);
  stressDuration.add(res.timings.duration);
  const success = check(res, {
    'stress status is 200': (r) => r.status === 200,
    'stress has final_hash': (r) => r.json('final_hash') !== undefined,
  });
  errorRate.add(!success);
  sleep(0.2);
}

export default function () {
  healthCheck();
  dataQuery();
}
