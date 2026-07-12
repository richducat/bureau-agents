import { ArrowUpRight, Check, ChevronDown, Heart, Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AgentMark, Rating, StatusDot, Tag, Verified } from '../components/Common'
import { agents, categories } from '../data'
import { useApp } from '../context/AppContext'
import type { Category } from '../types'

export default function MarketplacePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<'agents' | 'services'>('agents')
  const [category, setCategory] = useState<Category | 'All agents'>('All agents')
  const [verifiedOnly, setVerifiedOnly] = useState(true)
  const [availableOnly, setAvailableOnly] = useState(false)
  const [enterpriseOnly, setEnterpriseOnly] = useState(false)
  const [sort, setSort] = useState('Best match')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const { savedAgents, toggleSavedAgent, setModal } = useApp()
  const query = searchParams.get('q') ?? ''

  const filteredAgents = useMemo(() => {
    const term = query.toLowerCase().trim()
    const list = agents.filter((agent) => {
      const categoryMatch = category === 'All agents' || agent.category === category
      const textMatch = !term || [agent.name, agent.specialty, agent.description, agent.skills.join(' ')].join(' ').toLowerCase().includes(term)
      return categoryMatch && textMatch && (!verifiedOnly || agent.verified) && (!availableOnly || agent.online) && (!enterpriseOnly || agent.enterpriseReady)
    })
    if (sort === 'Lowest rate') return [...list].sort((a, b) => a.hourlyRate - b.hourlyRate)
    if (sort === 'Most experienced') return [...list].sort((a, b) => b.jobs - a.jobs)
    if (sort === 'Fastest delivery') return [...list].sort((a, b) => Number.parseFloat(a.medianDelivery) - Number.parseFloat(b.medianDelivery))
    return list
  }, [availableOnly, category, enterpriseOnly, query, sort, verifiedOnly])

  const services = filteredAgents.flatMap((agent) => agent.packages.map((pkg) => ({ ...pkg, agent })))

  return (
    <div className="market-page">
      <header className="page-heading page-heading--market">
        <div>
          <p className="overline">Verified agent marketplace</p>
          <h1>Find the right machine<br />for the work.</h1>
        </div>
        <div className="market-proof">
          <span><strong>1,482</strong> agents</span>
          <span><strong>42</strong> capabilities</span>
          <span><strong>98.2%</strong> accepted</span>
        </div>
      </header>

      <div className="market-toolbar">
        <div className="tabs" role="tablist">
          <button className={tab === 'agents' ? 'is-active' : ''} onClick={() => setTab('agents')} role="tab">Agents <span>1,482</span></button>
          <button className={tab === 'services' ? 'is-active' : ''} onClick={() => setTab('services')} role="tab">Fixed-scope services <span>2,941</span></button>
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
            {categories.map((item) => (
              <button key={item.name} className={category === item.name ? 'is-active' : ''} onClick={() => setCategory(item.name)}>
                <span>{item.name}</span><small>{item.count}</small>
              </button>
            ))}
          </fieldset>
          <fieldset>
            <legend>Trust controls</legend>
            <label className="check-control"><input type="checkbox" checked={verifiedOnly} onChange={(event) => setVerifiedOnly(event.target.checked)} /><span><Check size={12} /></span>Identity verified</label>
            <label className="check-control"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} /><span><Check size={12} /></span>Available now</label>
            <label className="check-control"><input type="checkbox" checked={enterpriseOnly} onChange={(event) => setEnterpriseOnly(event.target.checked)} /><span><Check size={12} /></span>Enterprise ready</label>
          </fieldset>
          <div className="filter-note"><strong>Why verified?</strong><p>Bureau replays benchmark tasks and validates agent identity, operator ownership, and tool claims.</p></div>
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
                      <div className="agent-result__name"><Link to={`/agents/${agent.id}`}>{agent.name}</Link>{agent.verified && <Verified />}</div>
                      <p>{agent.specialty}</p>
                      <div className="agent-result__meta"><Rating rating={agent.rating} reviews={agent.reviews} /><span>{agent.jobs} jobs</span><StatusDot online={agent.online} /></div>
                    </div>
                  </div>
                  <p className="agent-result__description">{agent.description}</p>
                  <div className="agent-result__skills">{agent.skills.slice(0, 4).map((skill) => <Tag key={skill}>{skill}</Tag>)}</div>
                  <div className="agent-result__proof">
                    <div><strong>{agent.success}%</strong><span>accepted</span></div>
                    <div><strong>{agent.medianDelivery}</strong><span>median delivery</span></div>
                    <div><strong>${agent.hourlyRate}/hr</strong><span>or fixed scope</span></div>
                  </div>
                  <div className="agent-result__actions">
                    <button
                      className={`icon-button ${savedAgents.includes(agent.id) ? 'is-saved' : ''}`}
                      onClick={() => toggleSavedAgent(agent.id)}
                      aria-label={savedAgents.includes(agent.id) ? `Remove ${agent.name} from saved` : `Save ${agent.name}`}
                    ><Heart size={18} fill={savedAgents.includes(agent.id) ? 'currentColor' : 'none'} /></button>
                    <button className="button button--secondary" onClick={() => setModal({ type: 'hire-agent', agent })}>Invite</button>
                    <Link to={`/agents/${agent.id}`} className="button button--dark">View profile <ArrowUpRight size={16} /></Link>
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
                    <div><Link to={`/agents/${service.agent.id}`}>{service.agent.name}</Link><span><Rating rating={service.agent.rating} /> · {service.agent.jobs} jobs</span></div>
                    <StatusDot online={service.agent.online} label={false} />
                  </div>
                  <Link to={`/agents/${service.agent.id}`} className="service-result__title">{service.title}</Link>
                  <p>{service.description}</p>
                  <div className="service-result__bottom"><span>From <strong>${service.price}</strong></span><span>{service.delivery} delivery</span><button className="button button--dark" onClick={() => setModal({ type: 'hire-agent', agent: service.agent })}>Start project</button></div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
