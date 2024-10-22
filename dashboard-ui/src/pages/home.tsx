// Copyright 2024 Andres Morey
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

import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import numeral from 'numeral';
import { createContext, useContext, useMemo, useState } from 'react';
import TimeAgo from 'react-timeago';
import type { Formatter, Suffix, Unit } from 'react-timeago';

import Button from '@kubetail/ui/elements/Button';
import DataTable from '@kubetail/ui/elements/DataTable';
import type { SortBy } from '@kubetail/ui/elements/DataTable/Header';
import Form from '@kubetail/ui/elements/Form';
import Spinner from '@kubetail/ui/elements/Spinner';

import { config } from '@/app-config';
import logo from '@/assets/logo.svg';
import AuthRequired from '@/components/utils/AuthRequired';
import Footer from '@/components/widgets/Footer';
import ProfilePicDropdown from '@/components/widgets/ProfilePicDropdown';
import * as ops from '@/lib/graphql/ops';
import { getBasename, joinPaths } from '@/lib/helpers';
import { useListQueryWithSubscription, useLogMetadata } from '@/lib/hooks';
import { Workload, iconMap, labelsPMap } from '@/lib/workload';

type FileInfo = {
  size: string;
  lastModifiedAt?: Date;
};

type ContextType = {
  logMetadataMap: Map<string, FileInfo>;
};

const Context = createContext<ContextType>({
  logMetadataMap: new Map(),
});

function getContainerIDs(parentID: string, ownershipMap: Map<string, string[]>, containerIDs: string[] = []): string[] {
  ownershipMap.get(parentID)?.forEach((childID) => {
    if (ownershipMap.has(childID)) getContainerIDs(childID, ownershipMap, containerIDs);
    else containerIDs.push(childID);
  });
  return containerIDs;
}

function useCronJobs() {
  return useListQueryWithSubscription({
    query: ops.HOME_CRONJOBS_LIST_FETCH,
    subscription: ops.HOME_CRONJOBS_LIST_WATCH,
    queryDataKey: 'batchV1CronJobsList',
    subscriptionDataKey: 'batchV1CronJobsWatch',
  });
}

function useDaemonSets() {
  return useListQueryWithSubscription({
    query: ops.HOME_DAEMONSETS_LIST_FETCH,
    subscription: ops.HOME_DAEMONSETS_LIST_WATCH,
    queryDataKey: 'appsV1DaemonSetsList',
    subscriptionDataKey: 'appsV1DaemonSetsWatch',
  });
}

function useDeployments() {
  return useListQueryWithSubscription({
    query: ops.HOME_DEPLOYMENTS_LIST_FETCH,
    subscription: ops.HOME_DEPLOYMENTS_LIST_WATCH,
    queryDataKey: 'appsV1DeploymentsList',
    subscriptionDataKey: 'appsV1DeploymentsWatch',
  });
}

function useJobs() {
  return useListQueryWithSubscription({
    query: ops.HOME_JOBS_LIST_FETCH,
    subscription: ops.HOME_JOBS_LIST_WATCH,
    queryDataKey: 'batchV1JobsList',
    subscriptionDataKey: 'batchV1JobsWatch',
  });
}

function usePods() {
  return useListQueryWithSubscription({
    query: ops.HOME_PODS_LIST_FETCH,
    subscription: ops.HOME_PODS_LIST_WATCH,
    queryDataKey: 'coreV1PodsList',
    subscriptionDataKey: 'coreV1PodsWatch',
  });
}

function useReplicaSets() {
  return useListQueryWithSubscription({
    query: ops.HOME_REPLICASETS_LIST_FETCH,
    subscription: ops.HOME_REPLICASETS_LIST_WATCH,
    queryDataKey: 'appsV1ReplicaSetsList',
    subscriptionDataKey: 'appsV1ReplicaSetsWatch',
  });
}

function useStatefulSets() {
  return useListQueryWithSubscription({
    query: ops.HOME_STATEFULSETS_LIST_FETCH,
    subscription: ops.HOME_STATEFULSETS_LIST_WATCH,
    queryDataKey: 'appsV1StatefulSetsList',
    subscriptionDataKey: 'appsV1StatefulSetsWatch',
  });
}

function useLogFileInfo(uids: string[], ownershipMap: Map<string, string[]>) {
  const { logMetadataMap } = useContext(Context);

  const logFileInfo = new Map<string, { size: number, lastModifiedAt: Date, containerIDs: string[] }>();
  uids.forEach((uid) => {
    const containerIDs = getContainerIDs(uid, ownershipMap);

    // combine fileInfo
    const fileInfo = {
      size: 0,
      lastModifiedAt: new Date(0),
      containerIDs,
    };

    containerIDs.forEach((containerID) => {
      const val = logMetadataMap.get(containerID);

      if (val?.size) {
        fileInfo.size += parseInt(val.size, 10);
      }

      if (val?.lastModifiedAt) {
        fileInfo.lastModifiedAt = new Date(Math.max(val.lastModifiedAt.getTime(), fileInfo.lastModifiedAt.getTime()));
      }
    });

    // update map
    if (fileInfo.lastModifiedAt.getTime() > 0) logFileInfo.set(uid, fileInfo);
  });

  return logFileInfo;
}

const Namespaces = ({
  value,
  setValue,
}: {
  value: string;
  setValue: (value: string) => void;
}) => {
  const { data } = useListQueryWithSubscription({
    query: ops.HOME_NAMESPACES_LIST_FETCH,
    subscription: ops.HOME_NAMESPACES_LIST_WATCH,
    queryDataKey: 'coreV1NamespacesList',
    subscriptionDataKey: 'coreV1NamespacesWatch',
  });

  return (
    <Form.Select
      onChange={(ev) => setValue(ev.target.value)}
      value={value}
    >
      <Form.Option value="">All namespaces</Form.Option>
      {data?.coreV1NamespacesList?.items.map((item) => (
        <Form.Option key={item.id} value={item.metadata.name}>{item.metadata.name}</Form.Option>
      ))}
    </Form.Select>
  );
};

const lastModifiedAtFormatter: Formatter = (value: number, unit: Unit, suffix: Suffix, epochMilliseconds: number, nextFormatter?: Formatter) => {
  if (suffix === 'from now' || unit === 'second') return 'just now';
  if (nextFormatter) return nextFormatter(value, unit, suffix, epochMilliseconds);
  return '';
};

type DisplayItemsProps = {
  workload: Workload;
  namespace: string;
  fetching: boolean;
  items: {
    id: string;
    metadata: {
      uid: string;
      namespace: string;
      name: string;
      creationTimestamp: any;
      deletionTimestamp?: Date;
    };
  }[] | undefined | null;
  ownershipMap: Map<string, string[]>;
};

const DisplayItems = ({
  workload, namespace, fetching, items, ownershipMap,
}: DisplayItemsProps) => {
  // filter items
  const filteredItems = items?.filter((item) => {
    // remove deleted items
    if (item.metadata.deletionTimestamp) return false;

    // remove items not in filtered namespace
    return (namespace === '' || item.metadata.namespace === namespace);
  });

  const ids = filteredItems?.map((item) => item.metadata.uid) || [];
  const logFileInfo = useLogFileInfo(ids, ownershipMap);

  // handle sorting
  const [sortBy, setSortBy] = useState<SortBy>({ field: 'name', direction: 'ASC' });
  const handleSortByChange = (newSortBy: SortBy) => setSortBy(newSortBy);

  if (filteredItems) {
    filteredItems.sort((a, b) => {
      let cmp = 0;
      switch (sortBy.field) {
        case 'name':
          cmp = a.metadata.name.localeCompare(b.metadata.name);
          break;
        case 'namespace':
          cmp = a.metadata.namespace.localeCompare(b.metadata.namespace);
          if (cmp === 0) cmp = a.metadata.name.localeCompare(b.metadata.name);
          break;
        case 'created':
          cmp = a.metadata.creationTimestamp - b.metadata.creationTimestamp;
          break;
        case 'size': {
          const sizeA = logFileInfo.get(a.metadata.uid)?.size || 0;
          const sizeB = logFileInfo.get(b.metadata.uid)?.size || 0;
          cmp = sizeA - sizeB;
          break;
        }
        case 'lastEvent': {
          const tsA = logFileInfo.get(a.metadata.uid)?.lastModifiedAt || new Date(0);
          const tsB = logFileInfo.get(b.metadata.uid)?.lastModifiedAt || new Date(0);
          cmp = tsA.getTime() - tsB.getTime();
          break;
        }
        default:
          throw new Error('sort field not implemented');
      }

      // sort alphabetically if same
      if (cmp === 0 && sortBy.field !== 'name') return a.metadata.name.localeCompare(b.metadata.name);

      // otherwise use original cmp
      return sortBy.direction === 'ASC' ? cmp : cmp * -1;
    });
  }

  // handle show some-or-all
  const [showAll, setShowAll] = useState(false);
  const visibleItems = (filteredItems && showAll) ? filteredItems : filteredItems?.slice(0, 5);
  const hasMore = filteredItems && filteredItems.length > 5;

  // handle toggle-all
  const [selectAll, setSelectAll] = useState(false);
  const [isChecked, setIsChecked] = useState<Map<string, boolean>>(new Map());

  const handleSelectAllChange = () => {
    const newValue = !selectAll;
    setSelectAll(newValue);

    // update individual checkboxes
    filteredItems?.forEach((item) => isChecked.set(item.id, newValue));
    setIsChecked(new Map(isChecked));
  };

  const handleSingleCheckboxChange = (id: string) => {
    // update individual
    const newValue = !isChecked.get(id);
    isChecked.set(id, newValue);
    setIsChecked(new Map(isChecked));

    // update selectAll
    const values: boolean[] = [];
    filteredItems?.forEach((item) => values.push(isChecked.get(item.id) || false));

    // all-checked
    if (values.every((val) => val)) setSelectAll(true);

    // some-unchecked
    if (values.some((val) => !val)) setSelectAll(false);
  };

  // for label
  const Icon = iconMap[workload];
  const label = labelsPMap[workload];

  return (
    <>
      <thead>
        <tr>
          <td colSpan={5} className="pb-[5px] text-[0.9rem]">
            <div className="flex items-center space-x-1">
              <Icon className="w-[22px] h-[22px]" />
              <div>{label}</div>
              <div>{`(${filteredItems?.length})`}</div>
              {fetching && <div><Spinner size="xs" /></div>}
            </div>
          </td>
        </tr>
      </thead>
      {!filteredItems?.length && (
        <tbody>
          <tr>
            <td colSpan={5} className="pb-[30px] italic text-chrome-400">
              No results
            </td>
          </tr>
        </tbody>
      )}
      {filteredItems && filteredItems.length > 0 && (
        <>
          <DataTable.Header
            className="rounded-thead bg-transparent"
            sortBy={sortBy}
            onSortByChange={handleSortByChange}
          >
            <DataTable.Row>
              <DataTable.HeaderCell>
                <Form.Check
                  checked={selectAll}
                  onChange={handleSelectAllChange}
                />
              </DataTable.HeaderCell>
              <DataTable.HeaderCell
                sortField="name"
                initialSortDirection="ASC"
              >
                Name
              </DataTable.HeaderCell>
              {namespace === '' && (
                <DataTable.HeaderCell
                  sortField="namespace"
                  initialSortDirection="ASC"
                >
                  Namespace
                </DataTable.HeaderCell>
              )}
              <DataTable.HeaderCell
                sortField="created"
                initialSortDirection="DESC"
              >
                Created
              </DataTable.HeaderCell>
              {config.extensionsEnabled === true && (
                <>
                  <DataTable.HeaderCell
                    sortField="size"
                    initialSortDirection="DESC"
                    className="text-right"
                  >
                    Size
                  </DataTable.HeaderCell>
                  <DataTable.HeaderCell
                    sortField="lastEvent"
                    initialSortDirection="DESC"
                  >
                    Last Event
                  </DataTable.HeaderCell>
                </>
              )}
              <DataTable.HeaderCell>&nbsp;</DataTable.HeaderCell>
            </DataTable.Row>
          </DataTable.Header>
          <DataTable.Body className="rounded-tbody">
            {visibleItems?.map((item) => {
              const sourceString = `${item.metadata.namespace}/${workload}/${item.metadata.name}`;
              const fileInfo = logFileInfo.get(item.metadata.uid);

              // for last event
              const lastEventCls = fileInfo?.containerIDs.map((id) => `last_event_${id}`).join(' ');

              return (
                <DataTable.Row key={item.metadata.uid} className="text-chrome-700">
                  <DataTable.DataCell>
                    <Form.Check
                      name="source"
                      value={sourceString}
                      checked={isChecked.get(item.id) || false}
                      onChange={() => handleSingleCheckboxChange(item.id)}
                    />
                  </DataTable.DataCell>
                  <DataTable.DataCell>{item.metadata.name}</DataTable.DataCell>
                  {namespace === '' && (
                    <DataTable.DataCell>{item.metadata.namespace}</DataTable.DataCell>
                  )}
                  <DataTable.DataCell>
                    <TimeAgo key={Math.random()} date={item.metadata.creationTimestamp} title={item.metadata.creationTimestamp.toUTCString()} />
                  </DataTable.DataCell>
                  {config.extensionsEnabled === true && (
                    <>
                      <DataTable.DataCell className="text-right pr-[35px]">
                        {fileInfo?.size === undefined ? (
                          <span>--</span>
                        ) : (
                          numeral(fileInfo.size).format('0.0 b')
                        )}
                      </DataTable.DataCell>
                      <DataTable.DataCell className={lastEventCls}>
                        {fileInfo?.size === undefined ? (
                          <span>--</span>
                        ) : (
                          <TimeAgo
                            key={Math.random()}
                            date={fileInfo.lastModifiedAt}
                            formatter={lastModifiedAtFormatter}
                            minPeriod={60}
                            title={fileInfo.lastModifiedAt.toUTCString()}
                          />
                        )}
                      </DataTable.DataCell>
                    </>
                  )}
                  <DataTable.DataCell>
                    <a
                      target="_blank"
                      href={`${joinPaths(getBasename(), '/console')}?source=${encodeURIComponent(sourceString)}`}
                      className="flex items-center underline text-primary"
                    >
                      <div>view</div>
                      <ArrowTopRightOnSquareIcon className="w-[18px] h-[18px] ml-1" />
                    </a>
                  </DataTable.DataCell>
                </DataTable.Row>
              );
            })}
          </DataTable.Body>
          <tbody>
            <tr>
              <td colSpan={5} className="pb-[30px]">
                {hasMore && (
                  <button
                    type="button"
                    className="block underline cursor-pointer text-chrome-500"
                    onClick={() => setShowAll(!showAll)}
                  >
                    {showAll ? 'Show less...' : 'Show more...'}
                  </button>
                )}
              </td>
            </tr>
          </tbody>
        </>
      )}
    </>
  );
};

const LoadingModal = () => (
  <div className="relative z-10" role="dialog">
    <div className="fixed inset-0 bg-chrome-500 bg-opacity-75" />
    <div className="fixed inset-0 z-10 w-screen">
      <div className="flex min-h-full items-center justify-center p-0 text-center">
        <div className="relative transform overflow-hidden rounded-lg bg-background my-8 p-6 text-left shadow-xl">
          <div className="flex items-center space-x-2">
            <div>Loading Workloads</div>
            <Spinner size="sm" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

const DisplayWorkloads = ({ namespace }: { namespace: string; }) => {
  const cronjobs = useCronJobs();
  const daemonsets = useDaemonSets();
  const deployments = useDeployments();
  const jobs = useJobs();
  const pods = usePods();
  const replicasets = useReplicaSets();
  const statefulsets = useStatefulSets();

  const logMetadata = useLogMetadata({
    enabled: config.extensionsEnabled,
    onUpdate: (containerID) => {
      document.querySelectorAll(`.last_event_${containerID}`).forEach((el) => {
        const k = 'animate-flash-bg-green';
        el.classList.remove(k);
        el.classList.add(k);
        setTimeout(() => el.classList.remove(k), 1000);
      });
    },
  });

  // calculate ownership map
  const ownershipMap = useMemo(() => {
    const m = new Map<string, string[]>();

    // add workload ids
    [
      ...(daemonsets.data?.appsV1DaemonSetsList?.items || []),
      ...(jobs.data?.batchV1JobsList?.items || []),
      ...(pods.data?.coreV1PodsList?.items || []),
      ...(replicasets.data?.appsV1ReplicaSetsList?.items || []),
      ...(statefulsets.data?.appsV1StatefulSetsList?.items || []),
    ].forEach((item) => {
      item.metadata.ownerReferences.forEach((ref) => {
        const childUIDs = m.get(ref.uid) || [];
        childUIDs.push(item.metadata.uid);
        m.set(ref.uid, childUIDs);
      });
    });

    // add container ids
    pods.data?.coreV1PodsList?.items.forEach((pod) => {
      // strip out prefix (e.g. "containerd://")
      const containerIDs = pod.status.containerStatuses.map((status) => (
        status.containerID.replace(/^[^:]+:\/\/(.*)/, '$1')
      ));
      m.set(pod.metadata.uid, containerIDs);
    });

    return m;
  }, [
    daemonsets.data?.appsV1DaemonSetsList?.metadata.resourceVersion,
    jobs.data?.batchV1JobsList?.metadata.resourceVersion,
    pods.data?.coreV1PodsList?.metadata.resourceVersion,
    replicasets.data?.appsV1ReplicaSetsList?.metadata.resourceVersion,
    statefulsets.data?.appsV1StatefulSetsList?.metadata.resourceVersion,
  ]);

  const loading = cronjobs.loading || daemonsets.loading || deployments.loading || jobs.loading || pods.loading || replicasets.loading || statefulsets.loading;

  const logMetadataMap = new Map<string, FileInfo>();
  logMetadata.data?.logMetadataList?.items.forEach((item) => {
    logMetadataMap.set(item.spec.containerID, item.fileInfo);
  });

  const value = { logMetadataMap };
  const context = useMemo(() => value, [value]);

  return (
    <Context.Provider value={context}>
      {loading && <LoadingModal />}
      <DataTable className="rounded-table-wrapper min-w-[600px]" size="sm">
        <DisplayItems
          workload={Workload.CRONJOBS}
          namespace={namespace}
          fetching={cronjobs.fetching}
          items={cronjobs.data?.batchV1CronJobsList?.items}
          ownershipMap={ownershipMap}
        />
        <DisplayItems
          workload={Workload.DAEMONSETS}
          namespace={namespace}
          fetching={daemonsets.fetching}
          items={daemonsets.data?.appsV1DaemonSetsList?.items}
          ownershipMap={ownershipMap}
        />
        <DisplayItems
          workload={Workload.DEPLOYMENTS}
          namespace={namespace}
          fetching={deployments.fetching}
          items={deployments.data?.appsV1DeploymentsList?.items}
          ownershipMap={ownershipMap}
        />
        <DisplayItems
          workload={Workload.JOBS}
          namespace={namespace}
          fetching={jobs.fetching}
          items={jobs.data?.batchV1JobsList?.items}
          ownershipMap={ownershipMap}
        />
        <DisplayItems
          workload={Workload.PODS}
          namespace={namespace}
          fetching={pods.fetching}
          items={pods.data?.coreV1PodsList?.items}
          ownershipMap={ownershipMap}
        />
        <DisplayItems
          workload={Workload.REPLICASETS}
          namespace={namespace}
          fetching={replicasets.fetching}
          items={replicasets.data?.appsV1ReplicaSetsList?.items}
          ownershipMap={ownershipMap}
        />
        <DisplayItems
          workload={Workload.STATEFULSETS}
          namespace={namespace}
          fetching={statefulsets.fetching}
          items={statefulsets.data?.appsV1StatefulSetsList?.items}
          ownershipMap={ownershipMap}
        />
      </DataTable>
    </Context.Provider>
  );
};

const Home = () => {
  const [namespace, setNamespace] = useState('');

  return (
    <>
      <div className="px-[10px] py-[5px] flex items-center justify-between border-b-[1px] border-chrome-300 bg-chrome-100">
        <a href="/">
          <img src={joinPaths(getBasename(), logo)} alt="logo" className="display-block h-[31.4167px]" />
        </a>
        <ProfilePicDropdown />
      </div>
      <main className="px-[10px]">
        <form
          method="get"
          target="_blank"
          action={joinPaths(getBasename(), '/console')}
        >
          <div className="flex items-start justify-between mt-[10px] mb-[20px]">
            <div className="block w-[200px]">
              <Namespaces value={namespace} setValue={setNamespace} />
            </div>
            <Button type="submit">
              View in console
              <ArrowTopRightOnSquareIcon className="w-[18px] h-[18px] ml-1" />
            </Button>
          </div>
          <DisplayWorkloads namespace={namespace} />
        </form>
      </main>
    </>
  );
};

/**
 * Default component
 */

export default function Page() {
  return (
    <AuthRequired>
      <Home />
      <div className="fixed bottom-0 w-full">
        <Footer />
      </div>
    </AuthRequired>
  );
}