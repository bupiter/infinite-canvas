import localforage from "localforage";

export async function clearVoteWorkbenchData() {
    await Promise.all(["infinite-canvas", "infinite-canvas-plugins"].map((name) => localforage.dropInstance({ name })));
    localStorage.clear();
    sessionStorage.clear();
}
