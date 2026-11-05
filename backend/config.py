from pathlib import Path
import os
from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR = Path(os.getenv('HERMES_STUDIO_HOME', Path.home()/'.hermes-agent-studio'))
APP_DIR.mkdir(parents=True, exist_ok=True)

class Settings(BaseSettings):
    host: str='127.0.0.1'; port:int=8790
    lmstudio_base_url:str='http://127.0.0.1:1234'; lmstudio_api_key:str=''
    hermes_command:str='hermes'
    db_url:str=f"sqlite:///{APP_DIR/'studio.db'}"
    key_file:str=str(APP_DIR/'secret.key')
    model:str=''
    model_context:int=8192
    model_temperature:float=.7
    model_top_p:float=.95
    model_max_tokens:int=1024
    model_gpu_offload:str='auto'
    model_flash_attention:bool=True
    model_kv_gpu:bool=True
    model_streaming:bool=True
    model_config=SettingsConfigDict(env_file='.env',env_prefix='HAS_',extra='ignore')
settings=Settings()
