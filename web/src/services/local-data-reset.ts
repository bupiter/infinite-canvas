import localforage from "localforage";

export async function clearVoteWorkbenchData() {
    await localforage.dropInstance({ name: "infinite-canvas" });
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key?.startsWith("infinite-canvas:")) localStorage.removeItem(key);
    }
}
