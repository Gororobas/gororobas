import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
	component: App,
})

function App() {
	return (
		<div className="text-center">
			<h1 className="text-4xl">Front-end experiments:</h1>
			<ul className="space-y-4">
				<li>
					<Link
						className="text-blue-800 underline"
						to="/007-effect-sqlite-browser"
					>
						007: SQLite in the browser with Effect
					</Link>
				</li>
				<li>
					<Link
						className="text-blue-800 underline"
						to="/008-effect-atom-sqlite"
					>
						008: SQLite + Effect Atom
					</Link>
				</li>
			</ul>
		</div>
	)
}
