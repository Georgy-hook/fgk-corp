// Three can abort subordinate fetches but not synchronous decoding. If the
// caller closes during parse, ownership of a late result still has to end here.
export async function parseModel(loader, manager, bytes, path, signal, owner) {
  const abort = () => manager.abort?.();
  signal?.throwIfAborted();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const gltf = await loader.parseAsync(bytes, path);
    for (const root of gltf.scenes) owner.collect(root);
    signal?.throwIfAborted();
    return gltf;
  } catch (error) {
    owner.dispose();
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}
