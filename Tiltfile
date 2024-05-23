docker_build('kubetail', '.')

k8s_yaml('hack/k8s.dev.yaml')

k8s_resource(
  'kubetail',
  port_forwards='4000:4000'
)
