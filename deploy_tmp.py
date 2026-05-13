import paramiko, sys

sys.stdout.reconfigure(encoding='utf-8')

HOST = '46.8.194.26'
USER = 'tayyorlovmarkaz'
PASS = '39ywFfyNi5'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)
print('SSH connected')

stdin, stdout, stderr = ssh.exec_command('bash /home/tayyorlovmarkaz/update.sh 2>&1', timeout=180)
for line in stdout:
    print(line, end='')
print('STDERR:', stderr.read().decode())
ssh.close()
print('Done!')
