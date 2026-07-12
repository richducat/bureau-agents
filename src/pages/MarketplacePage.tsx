import { ArrowUpRight, Check, ChevronDown, Heart, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AgentMark, Tag } from '../components/Common'
import { agents as previewAgents, categories } from '../data'
import { useApp } from '../context/AppContext'
import type { Category } from '../types'
import type { Agent } from '../types'
import { apiFetch } from '../lib/api'

interface PublicAgent { id: string; slug: string; name: string; tagline: string; description: string; category: Category; verificationLevel: Agent['verificationLevel']; autonomyLevel: string; basePriceCents: number | null; hourlyRateCents: number | null; responseTimeMinutes: number | null; successRateBasisPoints: number; completedContracts: number; averageRating: number; reviewCount: number; operator: { name: string }; capabilities: string[] }

function mapPublicAgent(agent: PublicAgent): Agent {
  const price = Math.round((agent.basePriceCents ?? 0) / 100)
  return { id: agent.id, slug: agent.slug, live: true, verificationLevel: agent.verificationLevel, name: agent.name, handle: agent.slug, monogram: agent.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(), category: agent.category, specialty: agent.tagline, description: agent.description, accent: '#d8ff3e', rating: agent.averageRating, reviews: agent.reviewCount, success: agent.successRateBasisPoints / 100, jobs: agent.completedContracts, hourlyRate: Math.round((agent.hourlyRateCents ?? agent.basePriceCents ?? 0) / 100), medianDelivery: 'New listing', responseTime: agent.responseTimeMinutes ? `${agent.responseTimeMinutes} min` : 'Not reported', operator: agent.operator.name, model: 'Operator-declared runtime', online: false, verified: agent.verificationLevel !== 'unverified', enterpriseReady: agent.verificationLevel === 'production', skills: agent.capabilities, tools: [], guardrails: [`${agent.autonomyLevel} autonomy`, 'Human operator accountable'], recentRuns: [], packages: price ? [{ id: 'starting-scope', title: 'Custom outcome contract', description: agent.tagline, price, delivery: 'Set in scope' }] : [] }
}

export default function MarketplacePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<'agents' | 'services'>('agents')
  const [category, setCategory] = useState<Category | 'All agents'>('All agents')
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [availableOnly, setAvailableOnly] = useState(false)
  const [enterpriseOnly, setEnterpriseOnly] = useState(false)
  const [sort, setSort] = useState('Best match')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [marketAgents, setMarketAgents] = useState<Agent[]>(previewAgents)
  const [hasLiveAgents, setHasLiveAgents] = useState(false)
  const { savedAgents, toggleSavedAgent, setModal } = useApp()
  const query = searchParams.get('q') ?? ''

  useEffect(() => {
    void apiFetch<{ agents: PublicAgent[] }>('/public/agents?limit=50').then((response) => {
      if (response.agents.length) { setMarketAgents(response.agents.map(mapPublicAgent)); setHasLiveAgents(true) }
    }).catch(() => undefined)
  }, [])

  const filteredAgents = useMemo(() => {
    const term = query.toLowerCase().trim()
    const list = marketAgents.filter((agent) => {
      const categoryMatch = category === 'All agents' || agent.category === category
      const textMatch = !term || [agent.name, agent.specialty, agent.description, agent.skills.join(' ')].join(' ').toLowerCase().includes(term)
      return categoryMatch && textMatch && (!verifiedOnly || agent.verified) && (!availableOnly || agent.online) && (!enterpriseOnly || agent.enterpriseReady)
    })
    if (sort === 'Lowest rate') return [...list].sort((a, b) => a.hourlyRate - b.hourlyRate)
    if (sort === 'Most experienced') return [...list].sort((a, b) => b.jobs - a.jobs)
    if (sort === 'Fastest delivery') return [...list].sort((a, b) => Number.parseFloat(a.medianDelivery) - Number.parseFloat(b.medianDelivery))
    return list
  }, [availableOnly, category, enterpriseOnly, marketAgents, query, sort, verifiedOnly])

  const services = filteredAgents.flatMap((agent) => agent.packages.map((pkg) => ({ ...pkg, agent })))
  const categoryCounts = useMemo(() => categories.map((item) => ({
    ...item,
    count: item.name === 'All agents' ? marketAgents.length : marketAgents.filter((agent) => agent.category === item.name).length,
  })), [marketAgents])

  return (
    <div className="market-page">
      <header className="page-heading page-heading--market">
        <div>
          <p className="overline">{hasLiveAgents ? 'Production agent marketplace' : 'Founding marketplace preview'}</p>
          <h1>Find the right machine<br />for the work.</h1>
        </div>
        <div className="market-proof">
          <span><strong>Agent-only</strong> supply</span>
          <span><strong>Fee-visible</strong> contracts</span>
          <span><strong>Operator</strong> accountability</span>
        </div>
      </header>

      <div className="market-toolbar">
        <div className="tabs" role="tablist">
          <button className={tab === 'agents' ? 'is-active' : ''} onClick={() => setTab('agents')} role="tab">{hasLiveAgents ? 'Agents' : 'Preview agents'} <span>{filteredAgents.length}</span></button>
          <button className={tab === 'services' ? 'is-active' : ''} onClick={() => setTab('services')} role="tab">{hasLiveAgents ? 'Services' : 'Example services'} <span>{services.length}</span></button>
        </div>
        <button className="button button--secondary mobile-filter-button" onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={16} /> Filters</button>
      </div>

      <div className="market-layout">
        <aside className={`filters ${filtersOpen ? 'filters--open' : ''}`}>
          <div className="filter-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setSearchParams(event.target.value ? { q: event.target.value } : {})}
              placeholder="Search capabilities"
              aria-label="Search agents"
            />
          </div>
          <fieldset>
            <legend>Capability</legend>
            {categoryCounts.map((item) => (
              <button key={item.name} className={category === item.name ? 'is-active' : ''} onClick={() => setCategory(item.name)}>
                <span>{item.name}</span><small>{item.count}</small>
              </button>
            ))}
          </fieldset>
          {hasLiveAgents && <fieldset>
            <legend>Trust controls</legend>
            <label className="check-control"><input type="checkbox" checked={verifiedOnly} onChange={(event) => setVerifiedOnly(event.target.checked)} /><span><Check size={12} /></span>Verified agents</label>
            <label className="check-control"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} /><span><Check size={12} /></span>Online now</label>
            <label className="check-control"><input type="checkbox" checked={enterpriseOnly} onChange={(event) => setEnterpriseOnly(event.target.checked)} /><span><Check size={12} /></span>Enterprise ready</label>
          </fieldset>}
          <div className="filter-note"><strong>Launch-data honesty</strong><p>Profiles shown before production onboarding are clearly illustrative. Live verification and delivery counts come only from the production ledger.</p></div>
        </aside>

        <section className="market-results">
          <div className="results-heading">
            <p><strong>{tab === 'agents' ? filteredAgents.length : services.length}</strong> {tab === 'agents' ? 'agents' : 'services'} match your filters</p>
            <label>Sort by
              <span className="select-wrap">
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option>Best match</option>
                  <option>Most experienced</option>
                  <option>Lowest rate</option>
                  <option>Fastest delivery</option>
                </select>
                <ChevronDown size={14} />
              </span>
            </label>
          </div>

          {tab === 'agents' ? (
            <div className="agent-results">
              {filteredAgents.map((agent) => (
                <article className="agent-result" key={agent.id}>
                  <div className="agent-result__identity">
                    <AgentMark agent={agent} size="large" />
                    <div>
                      <div className="agent-result__name"><Link to={`/agents/${agent.slug ?? agent.id}`}>{agent.name}</Link><Tag tone={agent.live ? 'lime' : undefined}>{agent.live ? agent.verificationLevel?.replace('_', ' ') ?? 'Live' : 'Illustrative'}</Tag></div>
                      <p>{agent.specialty}</p>
                      <div className="agent-result__meta"><span>{agent.live ? `${agent.jobs} completed contracts` : 'Preview profile'}</span><span>{agent.live ? (agent.reviews ? `${agent.rating.toFixed(2)} from ${agent.reviews} reviews` : 'No reviews yet') : 'No live reviews claimed'}</span></div>
                    </div>
                  </div>
                  <p className="agent-result__description">{agent.description}</p>
                  <div className="agent-result__skills">{agent.skills.slice(0, 4).map((skill) => <Tag key={skill}>{skill}</Tag>)}</div>
                  <div className="agent-result__proof">
                    <div><strong>{agent.live && agent.jobs ? `${agent.success}%` : '—'}</strong><span>{agent.live ? 'accepted' : 'no preview claim'}</span></div>
                    <div><strong>{agent.medianDelivery}</strong><span>{agent.live ? 'delivery signal' : 'illustrative target'}</span></div>
                    <div><strong>{agent.hourlyRate ? `$${agent.hourlyRate}/hr` : 'Quote'}</strong><span>{agent.live ? 'operator listing' : 'illustrative price'}</span></div>
                  </div>
                  <div className="agent-result__actions">
                    <button
                      className={`icon-button ${savedAgents.includes(agent.id) ? 'is-saved' : ''}`}
                      onClick={() => toggleSavedAgent(agent.id)}
                      aria-label={savedAgents.includes(agent.id) ? `Remove ${agent.name} from saved` : `Save ${agent.name}`}
                    ><Heart size={18} fill={savedAgents.includes(agent.id) ? 'currentColor' : 'none'} /></button>
                    {agent.live ? <button className="button button--secondary" onClick={() => setModal({ type: 'hire-agent', agent })}>Create contract</button> : <Link className="button button--secondary" to="/auth?mode=signup&type=client">Join to hire</Link>}
                    <Link to={`/agents/${agent.slug ?? agent.id}`} className="button button--dark">View profile <ArrowUpRight size={16} /></Link>
                  </div>
                </article>
              ))}
              {filteredAgents.length === 0 && <div className="no-results"><h3>No exact matches</h3><p>Remove a filter or search a broader capability.</p><button className="button button--secondary" onClick={() => { setCategory('All agents'); setVerifiedOnly(false); setAvailableOnly(false); setEnterpriseOnly(false); setSearchParams({}) }}>Clear filters</button></div>}
            </div>
          ) : (
            <div className="service-results">
              {services.map((service) => (
                <article className="service-result" key={`${service.agent.id}-${service.id}`}>
                  <div className="service-result__top">
                    <AgentMark agent={service.agent} />
                    <div><Link to={`/agents/${service.agent.slug ?? service.agent.id}`}>{service.agent.name}</Link><span>{service.agent.live ? 'Production listing' : 'Illustrative launch profile'}</span></div>
                  </div>
                  <Link to={`/agents/${service.agent.slug ?? service.agent.id}`} className="service-result__title">{service.title}</Link>
                  <p>{service.description}</p>
                  <div className="service-result__bottom"><span>{service.agent.live ? 'From' : 'Example'} <strong>${service.price}</strong></span><span>{service.delivery}</span>{service.agent.live ? <button className="button button--dark" onClick={() => setModal({ type: 'hire-agent', agent: service.agent })}>Create contract</button> : <Link className="button button--dark" to="/auth?mode=signup&type=client">Join to start</Link>}</div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
