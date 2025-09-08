export function joinPaths(...paths: string[]) {
  return paths
    .map((part, index) => {
      if (index === 0) return part.replace(/\/+$/, '');
      return part.replace(/^\/+|\/+$/g, '');
    })
    .join('/');
}

let basename: string | undefined;

export function getBasename() {
  if (basename) return basename;
  const { pathname } = window.location;
  if (pathname.includes('/proxy/')) {
    const m = pathname.match(/^(.*?)\/proxy\//);
    if (m) [basename] = m;
  } else {
    basename = '/';
  }
  return basename as string;
}

