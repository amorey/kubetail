load('ext://restart_process', 'docker_build_with_restart')
load('ext://namespace', 'namespace_create')

namespace_create('kubetail-system')

# kubetail-api
local_resource(
  'kubetail-api-compile',
  'cd modules && CGO_ENABLED=0 GOOS=linux go build -o ../.tilt/api ./api/cmd/main.go',
  deps=[
    './modules/api',
    './modules/shared'
  ]
)

docker_build_with_restart(
  'kubetail-api',
  dockerfile='hack/tilt/Dockerfile.kubetail-api',
  context='.',
  entrypoint="/api/api -c /etc/kubetail/config.yaml",
  only=[
    './.tilt/api',
  ],
  live_update=[
    sync('./.tilt/api', '/api/api'),
  ]
)

# kubetail-agent
local_resource(
  'kubetail-agent-compile',
  'cd modules && CGO_ENABLED=0 GOOS=linux go build -o ../.tilt/agent ./agent/cmd/main.go',
  deps=[
    './modules/agent',
    './modules/shared'
  ]
)

docker_build_with_restart(
  'kubetail-agent',
  dockerfile='hack/tilt/Dockerfile.kubetail-agent',
  context='.',
  entrypoint="/agent/agent -c /etc/kubetail/config.yaml",
  only=[
    './.tilt/agent',
  ],
  live_update=[
    sync('./.tilt/agent', '/agent/agent'),
  ]
)

# kubetail-dashboard
local_resource(
  'kubetail-dashboard-compile',
  'cd modules && CGO_ENABLED=0 GOOS=linux go build -o ../.tilt/dashboard ./dashboard/cmd/main.go',
  deps=[
    './modules/dashboard',
    './modules/shared'
  ]
)

docker_build_with_restart(
  'kubetail-dashboard',
  dockerfile='hack/tilt/Dockerfile.kubetail-dashboard',
  context='.',
  entrypoint="/dashboard/dashboard -c /etc/kubetail/config.yaml",
  only=[
    './.tilt/dashboard',
  ],
  live_update=[
    sync('./.tilt/dashboard', '/dashboard/dashboard'),
  ]
)

# apply manifests
k8s_yaml('hack/tilt/kubetail.yaml')
k8s_yaml('hack/tilt/loggen.yaml')
k8s_yaml('hack/tilt/loggen-ansi.yaml')
k8s_yaml('hack/tilt/echoserver.yaml')
k8s_yaml('hack/tilt/cronjob.yaml')
k8s_yaml('hack/tilt/chaoskube.yaml')

# define resources
k8s_resource(
  objects=[
    'kubetail-system:namespace',
    'kubetail:configmap',
    'kubetail-testuser:serviceaccount',
    'kubetail-testuser:role',
    'kubetail-testuser:clusterrole',
    'kubetail-testuser:rolebinding',
    'kubetail-testuser:clusterrolebinding',
  ],
  new_name='kubetail-shared',
)

k8s_resource(
  'kubetail-api',
  port_forwards='5001:80',
  objects=[
    'kubetail-api:serviceaccount',
    'kubetail-api:role',
    'kubetail-api:rolebinding',
  ],
  resource_deps=['kubetail-shared'],
)

k8s_resource(
  'kubetail-agent',
  objects=[
    'kubetail-agent:serviceaccount',
    'kubetail-agent:clusterrole',
    'kubetail-agent:clusterrolebinding',
    'kubetail-agent:networkpolicy',
  ],
  resource_deps=['kubetail-shared'],
)

k8s_resource(
  'kubetail-dashboard',
  port_forwards='5000:80',
  objects=[
    'kubetail-dashboard:clusterrole',
    'kubetail-dashboard:clusterrolebinding',
    'kubetail-dashboard:serviceaccount',
  ],
  resource_deps=['kubetail-shared'],
)

k8s_resource(
  objects=[
    'kubetail-cli:serviceaccount',
    'kubetail-cli:clusterrole',
    'kubetail-cli:clusterrolebinding',
  ],
  new_name='kubetail-cli',
)

k8s_resource(
  'chaoskube',
  objects=[
    'chaoskube:serviceaccount',
    'chaoskube:clusterrole',
    'chaoskube:clusterrolebinding',
    'chaoskube:role',
    'chaoskube:rolebinding'
  ]
)

k8s_resource(
  'echoserver',
  port_forwards='8080:8080',
)
