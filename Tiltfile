load('ext://restart_process', 'docker_build_with_restart')

# backend
local_resource(
  'kubetail-backend-compile',
  'cd backend && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o build/server ./cmd/server',
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

# kubernetes
k8s_yaml('hack/tilt/k8s.yaml')

k8s_resource(
  'kubetail-backend',
  port_forwards='4000:4000',
  objects=[
    'kubetail-backend:serviceaccount',
    'kubetail-backend:clusterrole',
    'kubetail-backend:clusterrolebinding',
    'kubetail-backend:configmap'
  ]
)
