"""Transport only. Battle Force V2 validation is implemented once, in JavaScript."""
import json
from pathlib import Path
import subprocess

RUNNER = Path(__file__).resolve().parent / 'tools/battleforce-node.cjs'


def call_js(action, **payload):
    try:
        result = subprocess.run(
            ['node', str(RUNNER)], input=json.dumps({'action': action, **payload}, ensure_ascii=False),
            capture_output=True, text=True, encoding='utf-8', timeout=15,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), check=False,
        )
    except FileNotFoundError as error:
        raise ValueError('V2 战斗部队需要 Node.js；本次操作未保存。') from error
    except subprocess.TimeoutExpired as error:
        raise ValueError('V2 战斗部队校验超时；本次操作未保存。') from error
    try:
        response = json.loads(result.stdout)
    except (ValueError, TypeError) as error:
        raise ValueError('V2 战斗部队校验未返回有效结果。') from error
    if result.returncode or 'error' in response:
        raise ValueError(response.get('error', 'V2 战斗部队校验失败。'))
    return response['result']


def validate_package(package):
    # Existing rule packages retain their Python-only save path.
    forces = package.get('battleForces', {})
    if not isinstance(forces, dict):
        raise ValueError('battleForces 必须为对象')
    if not any(isinstance(bf, dict) and ('v2' in bf or type(bf.get('engineVersion', 1)) not in (int, float)
                                       or bf.get('engineVersion', 1) != 1) for bf in forces.values()):
        return
    issues = call_js('validatePackage', pkg=package)
    if issues:
        raise ValueError('；'.join(i['path'] + '：' + i['message'] for i in issues))
