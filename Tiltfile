load('ext://restart_process', 'docker_build_with_restart')

# kubetail-backend
local_resource(
  'kubetail-backend-compile',
  'cd backend && CGO_ENABLED=0 GOOS=linux go build -o build/server ./cmd/server',
  deps=['./backend'],
  ignore=['./backend/build']
)

docker_build_with_restart(
  'kubetail-backend',
  dockerfile='hack/tilt/Dockerfile.backend',
  context='.',
  entrypoint="/backend/build/server -c /etc/kubetail/config.yaml",
  only=[
    './backend/build',
    './backend/templates'
  ],
  live_update=[
    sync('./backend/build', '/backend/build'),
    sync('./backend/templates', '/backend/templates')
  ]
)

# apply manifests
k8s_yaml('hack/tilt/nats.yaml')
k8s_yaml('hack/tilt/loggen.yaml')
k8s_yaml('hack/tilt/loggen-ansi.yaml')
k8s_yaml('hack/tilt/chaoskube.yaml')
k8s_yaml('hack/tilt/kubetail-backend.yaml')

# define resources
k8s_resource(
  'nats',
  objects=[
    'nats:configmap'
  ]
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
  'kubetail-backend',
  port_forwards='4000:4000',
  objects=[
    'kubetail-backend:serviceaccount',
    'kubetail-backend:clusterrole',
    'kubetail-backend:clusterrolebinding',
    'kubetail-backend:configmap'
  ],
  resource_deps=[
    'nats'
  ]
)
