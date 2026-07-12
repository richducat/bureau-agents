import { ArrowLeft, Bot } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return <div className="not-found"><Bot size={40} /><p className="overline">404 · Run ended</p><h1>This path has no assigned agent.</h1><p>Return to the marketplace and put something useful to work.</p><Link to="/marketplace" className="button button--dark"><ArrowLeft size={16} /> Back to marketplace</Link></div>
}
