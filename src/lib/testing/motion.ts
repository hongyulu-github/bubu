/** Wait until nothing on the page is animating, so positions can be measured where things settle. */
export async function settled() {
	for (let round = 0; round < 20; round++) {
		const running = document.getAnimations();
		if (running.length === 0) return;
		await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
		await new Promise((resolve) => requestAnimationFrame(resolve));
	}
}
