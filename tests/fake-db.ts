// Minimal in-memory Supabase-shaped DB used only by unit tests. No network or real DB access.
type Row = Record<string, any>;
type Filter = { field: string; value: any };

export type FakeDbOptions = {
  fail?: (op: string, table: string, payload: any) => any | undefined;
  signedUrls?: Record<string, string>;
  signedUrlError?: any;
  downloads?: Record<string, Uint8Array>;
};

let nextId = 0;
function mockUuid() {
  nextId += 1;
  return `00000000-0000-4000-8000-${String(nextId).padStart(12, '0')}`;
}

function readPath(row: any, path: string): any {
  let cursor = row;
  for (const part of path.split('.')) {
    if (Array.isArray(cursor)) cursor = cursor.map(item => item?.[part]);
    else cursor = cursor?.[part];
  }
  return cursor;
}

function matches(row: Row, filters: Filter[]) {
  return filters.every(({ field, value }) => {
    const actual = readPath(row, field);
    if (Array.isArray(actual)) return actual.some(item => String(item) === String(value));
    return actual === value;
  });
}

export function fakeDb(seed: Record<string, Row[]>, options: FakeDbOptions = {}) {
  const tables: Record<string, Row[]> = { ...seed };
  const calls: Array<{ op: string; table: string; payload: any; filters: Filter[] }> = [];
  const storageCalls: Array<{ bucket: string; op: string; path?: any; expires?: any }> = [];

  for (const key of Object.keys(tables)) {
    if (key !== '__storage__' && !Array.isArray(tables[key])) tables[key] = [];
  }

  function makeQuery(table: string, op: string, payload: any) {
    const filters: Filter[] = [];
    let limitCount: number | null = null;
    let singleMode: 'none' | 'single' | 'maybeSingle' = 'none';

    const execute = async () => {
      const failure = options.fail?.(op, table, payload);
      if (failure) return { data: null, error: failure };
      calls.push({ op, table, payload, filters: [...filters] });
      if (!tables[table]) tables[table] = [];

      let rows: Row[] = [];
      if (op === 'insert') {
        const row = { ...(payload || {}) };
        if (!row.id) row.id = mockUuid();
        tables[table].push(row);
        rows = [row];
      } else if (op === 'update') {
        rows = tables[table].filter(row => matches(row, filters));
        for (const row of rows) Object.assign(row, payload || {});
      } else if (op === 'delete') {
        rows = tables[table].filter(row => matches(row, filters));
        const removed = new Set(rows);
        tables[table] = tables[table].filter(row => !removed.has(row));
      } else {
        rows = tables[table].filter(row => matches(row, filters));
      }

      if (limitCount !== null) rows = rows.slice(0, limitCount);
      const data = singleMode === 'none' ? rows : (rows[0] || null);
      const error = singleMode === 'single' && !rows.length ? { code: 'PGRST116' } : null;
      return { data, error };
    };

    const query: any = {
      eq(field: string, value: any) { filters.push({ field, value }); return query; },
      order() { return query; },
      limit(count: number) { limitCount = count; return query; },
      select() { return query; },
      single() { singleMode = 'single'; return execute(); },
      maybeSingle() { singleMode = 'maybeSingle'; return execute(); },
      then(onFulfilled: any, onRejected: any) { return execute().then(onFulfilled, onRejected); },
    };
    return query;
  }

  const storage = {
    from(bucket: string) {
      return {
        createSignedUrl(path: string, expires: number) {
          storageCalls.push({ bucket, op: 'createSignedUrl', path, expires });
          if (options.signedUrlError) return Promise.resolve({ data: null, error: options.signedUrlError });
          const signedUrl = options.signedUrls?.[path] || `https://signed.invalid/${encodeURIComponent(path)}?token=mock`;
          return Promise.resolve({ data: { signedUrl }, error: null });
        },
        getPublicUrl(path: string) {
          storageCalls.push({ bucket, op: 'getPublicUrl', path });
          return { data: { publicUrl: `https://public.invalid/${bucket}/${path}` } };
        },
        createSignedUploadUrl(path: string) {
          storageCalls.push({ bucket, op: 'createSignedUploadUrl', path });
          return Promise.resolve({ data: { token: 'mock-token', signedUrl: `https://upload.invalid/${path}` }, error: null });
        },
        list(prefix: string) {
          storageCalls.push({ bucket, op: 'list', path: prefix });
          const storageTables = (tables.__storage__ || {}) as unknown as Record<string, Row[]>;
          return Promise.resolve({ data: storageTables[bucket] || [], error: null });
        },
        download(path: string) {
          storageCalls.push({ bucket, op: 'download', path });
          const bytes = options.downloads?.[path];
          if (!bytes) return Promise.resolve({ data: null, error: { code: 'not_found' } });
          return Promise.resolve({
            data: { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) },
            error: null,
          });
        },
      };
    },
  };

  return {
    calls,
    storageCalls,
    tables,
    storage,
    from(table: string) {
      return {
        select() { return makeQuery(table, 'select', null); },
        insert(payload: Row) { return makeQuery(table, 'insert', payload); },
        update(payload: Row) { return makeQuery(table, 'update', payload); },
        delete() { return makeQuery(table, 'delete', null); },
      };
    },
  };
}
