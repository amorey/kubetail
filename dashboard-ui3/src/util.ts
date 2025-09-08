export function stripContainerRuntimePrefix(containerID: string | null | undefined): string | null {
  if (!containerID) return null;
  const m = containerID.match(/^[^:]+:\/\/(.*)$/);
  return m ? m[1] : containerID;
}

