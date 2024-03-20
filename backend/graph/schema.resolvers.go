package graph

// This file will be automatically regenerated based on the schema, any resolver implementations
// will be copied through when generating and any unknown code will be moved to the end.
// Code generated by github.com/99designs/gqlgen version v0.17.44

import (
	"bufio"
	"bytes"
	"context"
	"io"
	"strings"

	"github.com/kubetail-org/kubetail/graph/model"
	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/watch"
)

// Object is the resolver for the object field.
func (r *appsV1DaemonSetsWatchEventResolver) Object(ctx context.Context, obj *watch.Event) (*appsv1.DaemonSet, error) {
	return typeassertRuntimeObject[*appsv1.DaemonSet](obj.Object)
}

// Object is the resolver for the object field.
func (r *appsV1DeploymentsWatchEventResolver) Object(ctx context.Context, obj *watch.Event) (*appsv1.Deployment, error) {
	return typeassertRuntimeObject[*appsv1.Deployment](obj.Object)
}

// Object is the resolver for the object field.
func (r *appsV1ReplicaSetsWatchEventResolver) Object(ctx context.Context, obj *watch.Event) (*appsv1.ReplicaSet, error) {
	return typeassertRuntimeObject[*appsv1.ReplicaSet](obj.Object)
}

// Object is the resolver for the object field.
func (r *appsV1StatefulSetsWatchEventResolver) Object(ctx context.Context, obj *watch.Event) (*appsv1.StatefulSet, error) {
	return typeassertRuntimeObject[*appsv1.StatefulSet](obj.Object)
}

// Object is the resolver for the object field.
func (r *batchV1CronJobsWatchEventResolver) Object(ctx context.Context, obj *watch.Event) (*batchv1.CronJob, error) {
	return typeassertRuntimeObject[*batchv1.CronJob](obj.Object)
}

// Object is the resolver for the object field.
func (r *batchV1JobsWatchEventResolver) Object(ctx context.Context, obj *watch.Event) (*batchv1.Job, error) {
	return typeassertRuntimeObject[*batchv1.Job](obj.Object)
}

// Object is the resolver for the object field.
func (r *coreV1NamespacesWatchEventResolver) Object(ctx context.Context, obj *watch.Event) (*corev1.Namespace, error) {
	return typeassertRuntimeObject[*corev1.Namespace](obj.Object)
}

// Object is the resolver for the object field.
func (r *coreV1NodesWatchEventResolver) Object(ctx context.Context, obj *watch.Event) (*corev1.Node, error) {
	return typeassertRuntimeObject[*corev1.Node](obj.Object)
}

// Object is the resolver for the object field.
func (r *coreV1PodsWatchEventResolver) Object(ctx context.Context, obj *watch.Event) (*corev1.Pod, error) {
	return typeassertRuntimeObject[*corev1.Pod](obj.Object)
}

// AppsV1DaemonSetsGet is the resolver for the appsV1DaemonSetsGet field.
func (r *queryResolver) AppsV1DaemonSetsGet(ctx context.Context, name string, namespace *string, options *metav1.GetOptions) (*appsv1.DaemonSet, error) {
	return r.K8SClientset(ctx).AppsV1().DaemonSets(r.ToNamespace(namespace)).Get(ctx, name, toGetOptions(options))
}

// AppsV1DaemonSetsList is the resolver for the appsV1DaemonSetsList field.
func (r *queryResolver) AppsV1DaemonSetsList(ctx context.Context, namespace *string, options *metav1.ListOptions) (*appsv1.DaemonSetList, error) {
	return r.K8SClientset(ctx).AppsV1().DaemonSets(r.ToNamespace(namespace)).List(ctx, toListOptions(options))
}

// AppsV1DeploymentsGet is the resolver for the appsV1DeploymentsGet field.
func (r *queryResolver) AppsV1DeploymentsGet(ctx context.Context, name string, namespace *string, options *metav1.GetOptions) (*appsv1.Deployment, error) {
	return r.K8SClientset(ctx).AppsV1().Deployments(r.ToNamespace(namespace)).Get(ctx, name, toGetOptions(options))
}

// AppsV1DeploymentsList is the resolver for the appsV1DeploymentsList field.
func (r *queryResolver) AppsV1DeploymentsList(ctx context.Context, namespace *string, options *metav1.ListOptions) (*appsv1.DeploymentList, error) {
	return r.K8SClientset(ctx).AppsV1().Deployments(r.ToNamespace(namespace)).List(ctx, toListOptions(options))
}

// AppsV1ReplicaSetsGet is the resolver for the appsV1ReplicaSetsGet field.
func (r *queryResolver) AppsV1ReplicaSetsGet(ctx context.Context, name string, namespace *string, options *metav1.GetOptions) (*appsv1.ReplicaSet, error) {
	return r.K8SClientset(ctx).AppsV1().ReplicaSets(r.ToNamespace(namespace)).Get(ctx, name, toGetOptions(options))
}

// AppsV1ReplicaSetsList is the resolver for the appsV1ReplicaSetsList field.
func (r *queryResolver) AppsV1ReplicaSetsList(ctx context.Context, namespace *string, options *metav1.ListOptions) (*appsv1.ReplicaSetList, error) {
	return r.K8SClientset(ctx).AppsV1().ReplicaSets(r.ToNamespace(namespace)).List(ctx, toListOptions(options))
}

// AppsV1StatefulSetsGet is the resolver for the appsV1StatefulSetsGet field.
func (r *queryResolver) AppsV1StatefulSetsGet(ctx context.Context, name string, namespace *string, options *metav1.GetOptions) (*appsv1.StatefulSet, error) {
	return r.K8SClientset(ctx).AppsV1().StatefulSets(r.ToNamespace(namespace)).Get(ctx, name, toGetOptions(options))
}

// AppsV1StatefulSetsList is the resolver for the appsV1StatefulSetsList field.
func (r *queryResolver) AppsV1StatefulSetsList(ctx context.Context, namespace *string, options *metav1.ListOptions) (*appsv1.StatefulSetList, error) {
	return r.K8SClientset(ctx).AppsV1().StatefulSets(r.ToNamespace(namespace)).List(ctx, toListOptions(options))
}

// BatchV1CronJobsGet is the resolver for the batchV1CronJobsGet field.
func (r *queryResolver) BatchV1CronJobsGet(ctx context.Context, name string, namespace *string, options *metav1.GetOptions) (*batchv1.CronJob, error) {
	return r.K8SClientset(ctx).BatchV1().CronJobs(r.ToNamespace(namespace)).Get(ctx, name, toGetOptions(options))
}

// BatchV1CronJobsList is the resolver for the batchV1CronJobsList field.
func (r *queryResolver) BatchV1CronJobsList(ctx context.Context, namespace *string, options *metav1.ListOptions) (*batchv1.CronJobList, error) {
	return r.K8SClientset(ctx).BatchV1().CronJobs(r.ToNamespace(namespace)).List(ctx, toListOptions(options))
}

// BatchV1JobsGet is the resolver for the batchV1JobsGet field.
func (r *queryResolver) BatchV1JobsGet(ctx context.Context, name string, namespace *string, options *metav1.GetOptions) (*batchv1.Job, error) {
	return r.K8SClientset(ctx).BatchV1().Jobs(r.ToNamespace(namespace)).Get(ctx, name, toGetOptions(options))
}

// BatchV1JobsList is the resolver for the batchV1JobsList field.
func (r *queryResolver) BatchV1JobsList(ctx context.Context, namespace *string, options *metav1.ListOptions) (*batchv1.JobList, error) {
	return r.K8SClientset(ctx).BatchV1().Jobs(r.ToNamespace(namespace)).List(ctx, toListOptions(options))
}

// CoreV1NamespacesList is the resolver for the coreV1NamespacesList field.
func (r *queryResolver) CoreV1NamespacesList(ctx context.Context, options *metav1.ListOptions) (*corev1.NamespaceList, error) {
	response, err := r.K8SClientset(ctx).CoreV1().Namespaces().List(ctx, toListOptions(options))

	// apply app namespace filter
	if response != nil && r.namespace != "" {
		items := []corev1.Namespace{}
		for _, item := range response.Items {
			if item.Name == r.namespace {
				items = append(items, item)
			}
		}
		response.Items = items
	}

	return response, err
}

// CoreV1NodesList is the resolver for the coreV1NodesList field.
func (r *queryResolver) CoreV1NodesList(ctx context.Context, options *metav1.ListOptions) (*corev1.NodeList, error) {
	return r.K8SClientset(ctx).CoreV1().Nodes().List(ctx, toListOptions(options))
}

// CoreV1PodsGet is the resolver for the coreV1PodsGet field.
func (r *queryResolver) CoreV1PodsGet(ctx context.Context, namespace *string, name string, options *metav1.GetOptions) (*corev1.Pod, error) {
	return r.K8SClientset(ctx).CoreV1().Pods(r.ToNamespace(namespace)).Get(ctx, name, toGetOptions(options))
}

// CoreV1PodsList is the resolver for the coreV1PodsList field.
func (r *queryResolver) CoreV1PodsList(ctx context.Context, namespace *string, options *metav1.ListOptions) (*corev1.PodList, error) {
	return r.K8SClientset(ctx).CoreV1().Pods(r.ToNamespace(namespace)).List(ctx, toListOptions(options))
}

// CoreV1PodsGetLogs is the resolver for the coreV1PodsGetLogs field.
func (r *queryResolver) CoreV1PodsGetLogs(ctx context.Context, namespace *string, name string, options *corev1.PodLogOptions) ([]model.LogRecord, error) {
	// init options
	opts := toPodLogOptions(options)
	opts.Follow = false
	opts.Timestamps = true

	// execute query
	req := r.K8SClientset(ctx).CoreV1().Pods(r.ToNamespace(namespace)).GetLogs(name, &opts)
	podLogs, err := req.Stream(ctx)
	if err != nil {
		return nil, err
	}
	defer podLogs.Close()

	buf := new(bytes.Buffer)
	_, err = io.Copy(buf, podLogs)
	if err != nil {
		return nil, err
	}

	logLines := strings.Split(strings.Trim(buf.String(), "\n"), "\n")
	out := []model.LogRecord{}
	for _, line := range logLines {
		if len(line) != 0 {
			out = append(out, newLogRecordFromLogLine(line))
		}
	}

	return out, nil
}

// PodLogHead is the resolver for the podLogHead field.
func (r *queryResolver) PodLogHead(ctx context.Context, namespace *string, name string, container *string, after *string, since *string, first *int) (*model.PodLogQueryResponse, error) {
	// build query args
	args := HeadArgs{}

	if after != nil {
		args.After = *after
	}

	if since != nil {
		args.Since = *since
	}

	if first != nil {
		args.First = uint(*first)
	}

	return headPodLog(ctx, r.K8SClientset(ctx), r.ToNamespace(namespace), name, container, args)
}

// PodLogTail is the resolver for the podLogTail field.
func (r *queryResolver) PodLogTail(ctx context.Context, namespace *string, name string, container *string, before *string, last *int) (*model.PodLogQueryResponse, error) {
	// build query args
	args := TailArgs{}

	if before != nil {
		args.Before = *before
	}

	if last != nil {
		args.Last = uint(*last)
	}

	return tailPodLog(ctx, r.K8SClientset(ctx), r.ToNamespace(namespace), name, container, args)
}

// LivezGet is the resolver for the livezGet field.
func (r *queryResolver) LivezGet(ctx context.Context) (model.HealthCheckResponse, error) {
	return getHealth(ctx, r.K8SClientset(ctx), "livez"), nil
}

// ReadyzGet is the resolver for the readyzGet field.
func (r *queryResolver) ReadyzGet(ctx context.Context) (model.HealthCheckResponse, error) {
	return getHealth(ctx, r.K8SClientset(ctx), "readyz"), nil
}

// AppsV1DaemonSetsWatch is the resolver for the appsV1DaemonSetsWatch field.
func (r *subscriptionResolver) AppsV1DaemonSetsWatch(ctx context.Context, namespace *string, options *metav1.ListOptions) (<-chan *watch.Event, error) {
	watchAPI, err := r.K8SClientset(ctx).AppsV1().DaemonSets(r.ToNamespace(namespace)).Watch(ctx, toListOptions(options))
	if err != nil {
		return nil, err
	}
	return watchEventProxyChannel(ctx, watchAPI), nil
}

// AppsV1DeploymentsWatch is the resolver for the appsV1DeploymentsWatch field.
func (r *subscriptionResolver) AppsV1DeploymentsWatch(ctx context.Context, namespace *string, options *metav1.ListOptions) (<-chan *watch.Event, error) {
	watchAPI, err := r.K8SClientset(ctx).AppsV1().Deployments(r.ToNamespace(namespace)).Watch(ctx, toListOptions(options))
	if err != nil {
		return nil, err
	}
	return watchEventProxyChannel(ctx, watchAPI), nil
}

// AppsV1ReplicaSetsWatch is the resolver for the appsV1ReplicaSetsWatch field.
func (r *subscriptionResolver) AppsV1ReplicaSetsWatch(ctx context.Context, namespace *string, options *metav1.ListOptions) (<-chan *watch.Event, error) {
	watchAPI, err := r.K8SClientset(ctx).AppsV1().ReplicaSets(r.ToNamespace(namespace)).Watch(ctx, toListOptions(options))
	if err != nil {
		return nil, err
	}
	return watchEventProxyChannel(ctx, watchAPI), nil
}

// AppsV1StatefulSetsWatch is the resolver for the appsV1StatefulSetsWatch field.
func (r *subscriptionResolver) AppsV1StatefulSetsWatch(ctx context.Context, namespace *string, options *metav1.ListOptions) (<-chan *watch.Event, error) {
	watchAPI, err := r.K8SClientset(ctx).AppsV1().StatefulSets(r.ToNamespace(namespace)).Watch(ctx, toListOptions(options))
	if err != nil {
		return nil, err
	}
	return watchEventProxyChannel(ctx, watchAPI), nil
}

// BatchV1CronJobsWatch is the resolver for the batchV1CronJobsWatch field.
func (r *subscriptionResolver) BatchV1CronJobsWatch(ctx context.Context, namespace *string, options *metav1.ListOptions) (<-chan *watch.Event, error) {
	watchAPI, err := r.K8SClientset(ctx).BatchV1().CronJobs(r.ToNamespace(namespace)).Watch(ctx, toListOptions(options))
	if err != nil {
		return nil, err
	}
	return watchEventProxyChannel(ctx, watchAPI), nil
}

// BatchV1JobsWatch is the resolver for the batchV1JobsWatch field.
func (r *subscriptionResolver) BatchV1JobsWatch(ctx context.Context, namespace *string, options *metav1.ListOptions) (<-chan *watch.Event, error) {
	watchAPI, err := r.K8SClientset(ctx).BatchV1().Jobs(r.ToNamespace(namespace)).Watch(ctx, toListOptions(options))
	if err != nil {
		return nil, err
	}
	return watchEventProxyChannel(ctx, watchAPI), nil
}

// CoreV1NamespacesWatch is the resolver for the coreV1NamespacesWatch field.
func (r *subscriptionResolver) CoreV1NamespacesWatch(ctx context.Context, options *metav1.ListOptions) (<-chan *watch.Event, error) {
	watchAPI, err := r.K8SClientset(ctx).CoreV1().Namespaces().Watch(ctx, toListOptions(options))
	if err != nil {
		return nil, err
	}
	return watchEventProxyChannel(ctx, watchAPI), nil
}

// CoreV1NodesWatch is the resolver for the coreV1NodesWatch field.
func (r *subscriptionResolver) CoreV1NodesWatch(ctx context.Context, options *metav1.ListOptions) (<-chan *watch.Event, error) {
	watchAPI, err := r.K8SClientset(ctx).CoreV1().Nodes().Watch(ctx, toListOptions(options))
	if err != nil {
		return nil, err
	}
	return watchEventProxyChannel(ctx, watchAPI), nil
}

// CoreV1PodsWatch is the resolver for the coreV1PodsWatch field.
func (r *subscriptionResolver) CoreV1PodsWatch(ctx context.Context, namespace *string, options *metav1.ListOptions) (<-chan *watch.Event, error) {
	watchAPI, err := r.K8SClientset(ctx).CoreV1().Pods(r.ToNamespace(namespace)).Watch(ctx, toListOptions(options))
	if err != nil {
		return nil, err
	}
	return watchEventProxyChannel(ctx, watchAPI), nil
}

// CoreV1PodLogTail is the resolver for the coreV1PodLogTail field.
func (r *subscriptionResolver) CoreV1PodLogTail(ctx context.Context, namespace *string, name string, options *corev1.PodLogOptions) (<-chan *model.LogRecord, error) {
	// init options
	opts := toPodLogOptions(options)
	opts.Follow = true
	opts.Timestamps = true

	// execute query
	req := r.K8SClientset(ctx).CoreV1().Pods(r.ToNamespace(namespace)).GetLogs(name, &opts)
	podLogs, err := req.Stream(ctx)
	if err != nil {
		return nil, err
	}

	outCh := make(chan *model.LogRecord)

	go func() {
		defer podLogs.Close()

		scanner := bufio.NewScanner(podLogs)
		for scanner.Scan() {
			logRecord := newLogRecordFromLogLine(scanner.Text())
			outCh <- &logRecord
		}
		close(outCh)
	}()

	return outCh, nil
}

// PodLogFollow is the resolver for the podLogFollow field.
func (r *subscriptionResolver) PodLogFollow(ctx context.Context, namespace *string, name string, container *string, after *string, since *string) (<-chan *model.LogRecord, error) {
	// build follow args
	args := FollowArgs{}

	if after != nil {
		args.After = *after
	}

	if since != nil {
		args.Since = *since
	}

	// init follow
	inCh, err := followPodLog(ctx, r.K8SClientset(ctx), r.ToNamespace(namespace), name, container, args)
	if err != nil {
		return nil, err
	}

	// init output channel
	outCh := make(chan *model.LogRecord)

	// forward data from input to output channel
	go func() {
	Loop:
		for record := range inCh {
			x := record // for loop variable problem (https://github.com/golang/go/discussions/56010)
			select {
			case outCh <- &x:
				// wrote to output channel
			case <-ctx.Done():
				// listener closed connection
				break Loop
			}
		}
		close(outCh)
	}()

	return outCh, nil
}

// LivezWatch is the resolver for the livezWatch field.
func (r *subscriptionResolver) LivezWatch(ctx context.Context) (<-chan model.HealthCheckResponse, error) {
	return watchHealthChannel(ctx, r.K8SClientset(ctx), "livez"), nil
}

// ReadyzWatch is the resolver for the readyzWatch field.
func (r *subscriptionResolver) ReadyzWatch(ctx context.Context) (<-chan model.HealthCheckResponse, error) {
	return watchHealthChannel(ctx, r.K8SClientset(ctx), "readyz"), nil
}

// AppsV1DaemonSetsWatchEvent returns AppsV1DaemonSetsWatchEventResolver implementation.
func (r *Resolver) AppsV1DaemonSetsWatchEvent() AppsV1DaemonSetsWatchEventResolver {
	return &appsV1DaemonSetsWatchEventResolver{r}
}

// AppsV1DeploymentsWatchEvent returns AppsV1DeploymentsWatchEventResolver implementation.
func (r *Resolver) AppsV1DeploymentsWatchEvent() AppsV1DeploymentsWatchEventResolver {
	return &appsV1DeploymentsWatchEventResolver{r}
}

// AppsV1ReplicaSetsWatchEvent returns AppsV1ReplicaSetsWatchEventResolver implementation.
func (r *Resolver) AppsV1ReplicaSetsWatchEvent() AppsV1ReplicaSetsWatchEventResolver {
	return &appsV1ReplicaSetsWatchEventResolver{r}
}

// AppsV1StatefulSetsWatchEvent returns AppsV1StatefulSetsWatchEventResolver implementation.
func (r *Resolver) AppsV1StatefulSetsWatchEvent() AppsV1StatefulSetsWatchEventResolver {
	return &appsV1StatefulSetsWatchEventResolver{r}
}

// BatchV1CronJobsWatchEvent returns BatchV1CronJobsWatchEventResolver implementation.
func (r *Resolver) BatchV1CronJobsWatchEvent() BatchV1CronJobsWatchEventResolver {
	return &batchV1CronJobsWatchEventResolver{r}
}

// BatchV1JobsWatchEvent returns BatchV1JobsWatchEventResolver implementation.
func (r *Resolver) BatchV1JobsWatchEvent() BatchV1JobsWatchEventResolver {
	return &batchV1JobsWatchEventResolver{r}
}

// CoreV1NamespacesWatchEvent returns CoreV1NamespacesWatchEventResolver implementation.
func (r *Resolver) CoreV1NamespacesWatchEvent() CoreV1NamespacesWatchEventResolver {
	return &coreV1NamespacesWatchEventResolver{r}
}

// CoreV1NodesWatchEvent returns CoreV1NodesWatchEventResolver implementation.
func (r *Resolver) CoreV1NodesWatchEvent() CoreV1NodesWatchEventResolver {
	return &coreV1NodesWatchEventResolver{r}
}

// CoreV1PodsWatchEvent returns CoreV1PodsWatchEventResolver implementation.
func (r *Resolver) CoreV1PodsWatchEvent() CoreV1PodsWatchEventResolver {
	return &coreV1PodsWatchEventResolver{r}
}

// Query returns QueryResolver implementation.
func (r *Resolver) Query() QueryResolver { return &queryResolver{r} }

// Subscription returns SubscriptionResolver implementation.
func (r *Resolver) Subscription() SubscriptionResolver { return &subscriptionResolver{r} }

type appsV1DaemonSetsWatchEventResolver struct{ *Resolver }
type appsV1DeploymentsWatchEventResolver struct{ *Resolver }
type appsV1ReplicaSetsWatchEventResolver struct{ *Resolver }
type appsV1StatefulSetsWatchEventResolver struct{ *Resolver }
type batchV1CronJobsWatchEventResolver struct{ *Resolver }
type batchV1JobsWatchEventResolver struct{ *Resolver }
type coreV1NamespacesWatchEventResolver struct{ *Resolver }
type coreV1NodesWatchEventResolver struct{ *Resolver }
type coreV1PodsWatchEventResolver struct{ *Resolver }
type queryResolver struct{ *Resolver }
type subscriptionResolver struct{ *Resolver }
