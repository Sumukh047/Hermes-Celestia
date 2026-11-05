import sqlite3
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import settings

engine = create_engine(settings.db_url, connect_args={'check_same_thread': False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

def init_db():
    from . import models
    Base.metadata.create_all(engine)

    # Automatic safe migrations for existing SQLite tables
    with engine.connect() as conn:
        try:
            # Check if user_id exists in agents
            cursor = conn.execute(text("PRAGMA table_info(agents)"))
            columns = [row[1] for row in cursor.fetchall()]
            if "user_id" not in columns:
                conn.execute(text("ALTER TABLE agents ADD COLUMN user_id VARCHAR(64) DEFAULT 'default_user'"))
                conn.commit()
        except Exception as e:
            print(f"[DB MIGRATION] Error migrating agents: {e}")

        # Ensure user Sam with password SamSam exists
        try:
            from .security import hash_password
            res = conn.execute(text("SELECT id FROM users WHERE LOWER(username)='sam'")).fetchone()
            if not res:
                h = hash_password("SamSam")
                conn.execute(text(
                    f"INSERT INTO users (id, username, email, name, password_hash, settings_json, created_at) "
                    f"VALUES ('user_sam', 'Sam', 'sam@hermes.studio', 'Sam', '{h}', '{{}}', CURRENT_TIMESTAMP)"
                ))
                conn.commit()
            
            # Reassign default_user agents to user_sam
            conn.execute(text("UPDATE agents SET user_id='user_sam' WHERE user_id='default_user'"))
            conn.commit()
        except Exception as e:
            print(f"[DB MIGRATION] Error configuring user Sam: {e}")
