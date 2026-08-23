import os
import hashlib
import time
from flask import Flask, jsonify
import psycopg2

app = Flask(__name__)

def get_db_connection():
    conn = psycopg2.connect(
        host=os.environ.get('POSTGRES_HOST', 'db'),
        port=int(os.environ.get('POSTGRES_PORT', '5432')),
        database=os.environ.get('POSTGRES_DB', 'appdb'),
        user=os.environ.get('POSTGRES_USER', 'appuser'),
        password=os.environ.get('POSTGRES_PASSWORD', 'changeme')
    )
    return conn

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'version': os.environ.get('APP_VERSION', 'v1.0.0'),
        'timestamp': time.time()
    }), 200

@app.route('/data', methods=['GET'])
def data():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('SELECT NOW()')
        db_time = cur.fetchone()[0]
        cur.close()
        conn.close()
        return jsonify({'db_time': str(db_time)}), 200
    except Exception as e:
        return jsonify({'error': 'Database connection failed', 'details': str(e)}), 500

@app.route('/stress', methods=['GET'])
def stress():
    iterations = int(os.environ.get('STRESS_ITERATIONS', '10000'))
    hash_value = 'initial'
    for _ in range(iterations):
        hash_value = hashlib.sha256(hash_value.encode()).hexdigest()
    return jsonify({'final_hash': hash_value}), 200

if __name__ == '__main__':
    port = int(os.environ.get('API_PORT', '3000'))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)
