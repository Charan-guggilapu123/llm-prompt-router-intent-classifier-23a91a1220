const { handleUserMessage } = require("./routerService");

async function main() {
	const message = process.argv.slice(2).join(" ").trim();

	if (!message) {
		console.error('Usage: npm run cli -- "your message"');
		process.exitCode = 1;
		return;
	}

	const result = await handleUserMessage(message);
	console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
	main().catch((error) => {
		console.error("Application error:", error.message);
		process.exitCode = 1;
	});
}

module.exports = { main };
