import shutil,subprocess
from .config import settings
class Hermes:
    def __init__(self): self.path=shutil.which(settings.hermes_command)
    def status(self):
        if not self.path:return {'installed':False,'message':'Hermes CLI not detected. The native Agent Studio runtime is still usable.'}
        try:p=subprocess.run([self.path,'--version'],capture_output=True,text=True,timeout=5);return {'installed':True,'path':self.path,'version':(p.stdout or p.stderr).strip()[:200]}
        except Exception as e:return {'installed':True,'path':self.path,'error':str(e)}
    def command(self,a):
        cmd=[self.path or 'hermes','chat'];
        if a.get('model'):cmd+=['--model',a['model']]
        return cmd
