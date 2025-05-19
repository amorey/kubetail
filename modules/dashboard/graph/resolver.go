// Copyright 2024-2025 Andres Morey
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package graph

import (
	"context"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"
	authv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/utils/ptr"

	"github.com/kubetail-org/kubetail/modules/shared/config"
	"github.com/kubetail-org/kubetail/modules/shared/k8shelpers"

	"github.com/kubetail-org/kubetail/modules/dashboard/graph/model"
	clusterapi "github.com/kubetail-org/kubetail/modules/dashboard/internal/cluster-api"
)

// This file will not be regenerated automatically.
//
// It serves as dependency injection for your app, add any dependencies you require here.

//go:generate go run github.com/99designs/gqlgen generate

type Resolver struct {
	config            *config.Config
	cm                k8shelpers.ConnectionManager
	nr                k8shelpers.NamespaceResolver
	hm                clusterapi.HealthMonitor
	environment       config.Environment
	allowedNamespaces []string
}

// Teardown
func (r *Resolver) Teardown() {
	r.hm.Shutdown()
}

// listResource
func (r *Resolver) listResource(ctx context.Context, kubeContext string, namespace *string, options *metav1.ListOptions, modelPtr runtime.Object) error {
	// Deref namespace
	nsList, err := r.nr.DerefNamespaceToList(ctx, kubeContext, namespace)
	if err != nil {
		return err
	}

	// Get client
	dynamicClient, err := r.cm.GetOrCreateDynamicClient(kubeContext)
	if err != nil {
		return err
	}

	gvr, err := GetGVR(modelPtr)
	if err != nil {
		return err
	}

	client := dynamicClient.Resource(gvr)

	// Deref options
	opts := ptr.Deref(options, metav1.ListOptions{})

	// Execute requests
	list, err := func() (*unstructured.UnstructuredList, error) {
		if len(nsList) == 1 {
			return client.Namespace(nsList[0]).List(ctx, opts)
		} else {
			return listResourceMulti(ctx, client, nsList, opts)
		}
	}()
	if err != nil {
		return err
	}

	// return de-serialized object
	return runtime.DefaultUnstructuredConverter.FromUnstructured(list.UnstructuredContent(), modelPtr)
}

// watchResourceMulti
func (r *Resolver) watchResourceMulti(ctx context.Context, kubeContext string, namespace *string, options *metav1.ListOptions, gvr schema.GroupVersionResource) (<-chan *watch.Event, error) {
	// Deref namespace
	nsList, err := r.nr.DerefNamespaceToList(ctx, kubeContext, namespace)
	if err != nil {
		return nil, err
	}

	// Get client
	dynamicClient, err := r.cm.GetOrCreateDynamicClient(kubeContext)
	if err != nil {
		return nil, err
	}

	client := dynamicClient.Resource(gvr)

	// Deref options
	opts := ptr.Deref(options, metav1.ListOptions{})

	// decode resource version
	// TODO: fix me
	resourceVersionMap := map[string]string{}
	if len(nsList) == 1 {
		resourceVersionMap[nsList[0]] = opts.ResourceVersion
	} else {
		if tmp, err := decodeResourceVersionMulti(opts.ResourceVersion); err != nil {
			return nil, err
		} else {
			resourceVersionMap = tmp
		}
	}

	// init watch api's
	watchAPIs := []watch.Interface{}
	for _, ns := range nsList {
		// init options
		thisOpts := opts

		thisResourceVersion, exists := resourceVersionMap[ns]
		if exists {
			thisOpts.ResourceVersion = thisResourceVersion
		} else {
			thisOpts.ResourceVersion = ""
		}

		// init watch api
		watchAPI, err := client.Namespace(ns).Watch(ctx, thisOpts)
		if err != nil {
			return nil, err
		}
		watchAPIs = append(watchAPIs, watchAPI)
	}

	// start watchers
	outCh := make(chan *watch.Event)
	ctx, cancel := context.WithCancel(ctx)
	var wg sync.WaitGroup

	for _, watchAPI := range watchAPIs {
		wg.Add(1)
		go watchResource(ctx, watchAPI, outCh, cancel, &wg)
	}

	// cleanup
	go func() {
		wg.Wait()
		cancel()
		close(outCh)
	}()

	return outCh, nil
}

// kubernetesAPIHealthzGet
func (r *Resolver) kubernetesAPIHealthzGet(ctx context.Context, kubeContext string) *model.HealthCheckResponse {
	resp := &model.HealthCheckResponse{
		Status:    model.HealthCheckStatusFailure,
		Timestamp: time.Now().UTC(),
	}

	// Get client
	clientset, err := r.cm.GetOrCreateClientset(kubeContext)
	if err != nil {
		resp.Message = ptr.To(err.Error())
		return resp
	}

	// Execute request
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	_, err = clientset.CoreV1().RESTClient().Get().AbsPath("/livez").DoRaw(ctx)
	if err != nil {
		if ctx.Err() != nil {
			resp.Message = ptr.To("Bad Gateway")
		} else {
			resp.Message = ptr.To(err.Error())
		}
		return resp
	}

	resp.Status = model.HealthCheckStatusSuccess
	return resp
}

// getPermittedNamespaces retrieves the namespaces that the user has access to
func (r *Resolver) getPermittedNamespaces(ctx context.Context, kubeContext string, verb string, gvr schema.GroupVersionResource) ([]string, error) {
	// Get client
	clientset, err := r.cm.GetOrCreateClientset(kubeContext)
	if err != nil {
		return nil, err
	}

	// Get available namespaces (cross-check with `allowedNamespaces` setting)
	availableNamespaces := r.allowedNamespaces
	if len(availableNamespaces) == 0 {
		// Get all namespaces from API
		namespaceList, err := clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}

		for _, ns := range namespaceList.Items {
			availableNamespaces = append(availableNamespaces, ns.Name)
		}
	}

	// Define method to do self subject access review
	doSAR := func(namespace string) (bool, error) {
		sar := &authv1.SelfSubjectAccessReview{
			Spec: authv1.SelfSubjectAccessReviewSpec{
				ResourceAttributes: &authv1.ResourceAttributes{
					Namespace: namespace,
					Group:     gvr.Group,
					Verb:      verb,
					Resource:  gvr.Resource,
				},
			},
		}

		result, err := clientset.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, sar, metav1.CreateOptions{})
		if err != nil {
			return false, err
		}

		return result.Status.Allowed, nil
	}

	// Make individual requests in an error group
	g, ctx := errgroup.WithContext(ctx)

	ch := make(chan string, len(availableNamespaces))
	defer close(ch)

	for _, namespace := range availableNamespaces {
		g.Go(func() error {
			allowed, err := doSAR(namespace)
			if err != nil {
				return err
			}

			if allowed {
				ch <- namespace
			}

			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	// gather responses
	permittedNamespaces := []string{}
	for namespace := range ch {
		permittedNamespaces = append(permittedNamespaces, namespace)
	}

	return permittedNamespaces, nil
}
