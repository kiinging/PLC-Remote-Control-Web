import sqlite3
import json
import time
import os
import logging
import config

logger = logging.getLogger("gateway_db")

class GatewayDB:
    def __init__(self, db_path=None):
        self.db_path = db_path or config.DB_PATH
        self._init_db()

    def _get_conn(self):
        conn = sqlite3.connect(self.db_path, timeout=5.0)
        conn.execute("PRAGMA busy_timeout = 5000;")
        return conn

    def _init_db(self):
        """Initialize schema and WAL mode."""
        try:
            with self._get_conn() as conn:
                # Enable WAL for concurrency
                conn.execute("PRAGMA journal_mode = WAL;")
                conn.execute("PRAGMA synchronous = NORMAL;")
                
                # State Table
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS state (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL,
                        updated_at INTEGER NOT NULL
                    );
                """)
                
                # Trend Table
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS trend (
                        ts INTEGER NOT NULL,
                        pv REAL,
                        sp REAL,
                        mv REAL
                    );
                """)
                conn.execute("CREATE INDEX IF NOT EXISTS idx_trend_ts ON trend(ts);")
                conn.commit()
                
        except sqlite3.Error as e:
            logger.error(f"DB Init Failed: {e}")

    def set_state(self, key, value):
        """Save a value (JSON serialized) to the state table."""
        try:
            val_str = json.dumps(value)
            now = int(time.time())
            with self._get_conn() as conn:
                conn.execute(
                    "INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at;",
                    (key, val_str, now)
                )
        except Exception as e:
            logger.error(f"set_state error ({key}): {e}")

    def get_state(self, key, default=None):
        """Get a value from state table."""
        try:
            with self._get_conn() as conn:
                cursor = conn.execute("SELECT value FROM state WHERE key = ?", (key,))
                row = cursor.fetchone()
                if row:
                    return json.loads(row[0])
                return default
        except Exception as e:
            logger.error(f"get_state error ({key}): {e}")
            return default

    def get_all_state(self):
        """Return entire state as a dict."""
        res = {}
        try:
            with self._get_conn() as conn:
                cursor = conn.execute("SELECT key, value FROM state")
                for key, val_str in cursor.fetchall():
                    try:
                        res[key] = json.loads(val_str)
                    except:
                        res[key] = val_str
        except Exception as e:
            logger.error(f"get_all_state error: {e}")
        return res

    def log_trend(self, pv, sp, mv, ts=None):
        """Append a row to the trend table."""
        try:
            if ts is None:
                ts = int(time.time())
            
            # Ensure values are float or None
            pv = float(pv) if pv is not None else None
            sp = float(sp) if sp is not None else None
            mv = float(mv) if mv is not None else None

            with self._get_conn() as conn:
                conn.execute(
                    "INSERT INTO trend (ts, pv, sp, mv) VALUES (?, ?, ?, ?)",
                    (ts, pv, sp, mv)
                )
        except Exception as e:
            logger.error(f"log_trend error: {e}")

    def get_recent_trend(self, limit=900):
        """Get the last N trend rows."""
        try:
            with self._get_conn() as conn:
                cursor = conn.execute(
                    "SELECT ts, pv, sp, mv FROM trend ORDER BY ts DESC LIMIT ?",
                    (limit,)
                )
                rows = cursor.fetchall()
                # Sort back to ascending time for charts
                rows.reverse()
                return [{"time": time.strftime("%H:%M:%S", time.localtime(r[0])), 
                         "pv": r[1], "sp": r[2], "mv": r[3]} for r in rows]
        except Exception as e:
            logger.error(f"get_recent_trend error: {e}")
            return []

    def prune_trend(self, keep_seconds=3600):
        """Delete old rows."""
        try:
            cutoff = int(time.time()) - keep_seconds
            with self._get_conn() as conn:
                conn.execute("DELETE FROM trend WHERE ts < ?", (cutoff,))
        except Exception as e:
            logger.error(f"prune_trend error: {e}")

# Global instance for easy import, but config checks happen at runtime
db = GatewayDB()
