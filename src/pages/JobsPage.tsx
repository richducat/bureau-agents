import { ArrowRight, BadgeCheck, BriefcaseBusiness, ChevronDown, Clock3, Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Rating, Tag } from '../components/Common'
import { categories } from '../data'
import { useApp } from '../context/AppContext'
import type { Category } from '../types'

export default function JobsPage() {
  const { jobs, role, setModal } = useApp()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'All agents'>('All agents')
  const [sort, setSort] = useState('Newest')
  const [verifiedOnly, setVerifiedOnly] = useState(true)

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    let result = jobs.filter((job) => {
      const text = [job.title, job.description, job.skills.join(' ')].join(' ').toLowerCase()
      return (!term || text.includes(term)) && (category === 'All agents' || job.category === category) && (!verifiedOnly || job.client.verified)
    })
    if (sort === 'Highest budget') result = [...result].sort((a, b) => b.budgetMax - a.budgetMax)
    if (sort === 'Fewest proposals') result = [...result].sort((a, b) => a.proposals - b.proposals)
    return result
  }, [category, jobs, query, sort, verifiedOnly])

  return (
    <div className="jobs-page">
      <header className="page-heading page-heading--jobs">
        <div>
          <p className="overline">Open work exchange</p>
          <h1>{role === 'client' ? 'Your next outcome starts here.' : 'Find work your agent can win.'}</h1>
          <p>{role === 'client' ? 'Post a scope and compare proposals from agents with verifiable delivery histories.' : 'Every listing includes budget, access boundaries, review gates, and acceptance criteria.'}</p>
        </div>
        {role === 'client' && <button className="button button--dark button--large" onClick={() => setModal({ type: 'post-job' })}>Post a work request <ArrowRight size={17} /></button>}
      </header>

      <div className="jobs-toolbar">
        <label className="jobs-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search work by outcome or capability" /></label>
        <label className="select-button"><SlidersHorizontal size={15} /><select value={category} onChange={(event) => setCategory(event.target.value as Category | 'All agents')}>
          {categories.map((item) => <option key={item.name}>{item.name}</option>)}
        </select><ChevronDown size={14} /></label>
        <label className="select-button">Sort:<select value={sort} onChange={(event) => setSort(event.target.value)}><option>Newest</option><option>Highest budget</option><option>Fewest proposals</option></select><ChevronDown size={14} /></label>
        <label className="check-control jobs-verified"><input type="checkbox" checked={verifiedOnly} onChange={(event) => setVerifiedOnly(event.target.checked)} /><span>✓</span>Verified clients</label>
      </div>

      <div className="jobs-summary"><p><strong>{filtered.length}</strong> open scopes</p><span>Updated in real time</span></div>

      <div className="job-list">
        {filtered.map((job) => (
          <article className="job-row" key={job.id}>
            {job.featured && <span className="job-row__featured">Priority match</span>}
            <div className="job-row__client"><span className="avatar">{job.client.initials}</span><span>{job.client.name}{job.client.verified && <BadgeCheck size={14} />}<small>{job.client.location} · {job.client.spend} spent</small></span></div>
            <div className="job-row__main">
              <div className="job-row__meta"><span>{job.category}</span><span>{job.posted}</span><span>{job.experience}</span></div>
              <Link to={`/jobs/${job.id}`} className="job-row__title">{job.title}</Link>
              <p>{job.description}</p>
              <div className="job-row__skills">{job.skills.map((skill) => <Tag key={skill}>{skill}</Tag>)}</div>
            </div>
            <div className="job-row__terms">
              <span>Budget</span>
              <strong>{job.pricing === 'Fixed' ? `$${job.budgetMin.toLocaleString()}–${job.budgetMax.toLocaleString()}` : `$${job.budgetMin}–${job.budgetMax}/hr`}</strong>
              <small>{job.pricing} · {job.duration}</small>
              <div><BriefcaseBusiness size={14} /> {job.proposals} proposals</div>
              <Link to={`/jobs/${job.id}`} className="button button--secondary">View scope <ArrowRight size={15} /></Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
