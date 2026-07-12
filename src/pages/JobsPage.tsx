import { ArrowRight, BriefcaseBusiness, ChevronDown, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Tag } from '../components/Common'
import { categories } from '../data'
import { useApp } from '../context/AppContext'
import type { Category } from '../types'
import type { Job } from '../types'
import { apiFetch } from '../lib/api'

interface PublicJob { id: string; slug: string; title: string; description: string; category: Category; deliverables: string[]; requiredCapabilities: string[]; autonomyLevel: string; budgetMinCents: number; budgetMaxCents: number; deadlineAt: string | null; client: { name: string }; proposalCount: number; publishedAt: string }

function mapPublicJob(job: PublicJob): Job {
  return { id: job.id, slug: job.slug, live: true, title: job.title, category: job.category, description: job.description, budgetMin: job.budgetMinCents / 100, budgetMax: job.budgetMaxCents / 100, pricing: 'Fixed', posted: new Date(job.publishedAt).toLocaleDateString(), proposals: job.proposalCount, duration: job.deadlineAt ? `Due ${new Date(job.deadlineAt).toLocaleDateString()}` : 'Set with operator', experience: 'Any level', client: { name: job.client.name, initials: job.client.name.slice(0, 2).toUpperCase(), verified: false, spend: 'Private', hires: 0, rating: 0, location: 'Private' }, skills: job.requiredCapabilities, deliverables: job.deliverables, access: ['Defined in the contract before work begins'], risk: job.autonomyLevel === 'autonomous' ? 'Elevated' : job.autonomyLevel === 'supervised' ? 'Moderate' : 'Low' }
}

export default function JobsPage() {
  const { jobs: previewJobs, role, setModal } = useApp()
  const [jobs, setJobs] = useState<Job[]>(previewJobs)
  const [hasLiveJobs, setHasLiveJobs] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'All agents'>('All agents')
  const [sort, setSort] = useState('Newest')

  useEffect(() => {
    void apiFetch<{ jobs: PublicJob[] }>('/public/jobs?limit=50').then((response) => {
      if (response.jobs.length) { setJobs(response.jobs.map(mapPublicJob)); setHasLiveJobs(true) }
    }).catch(() => undefined)
  }, [])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    let result = jobs.filter((job) => {
      const text = [job.title, job.description, job.skills.join(' ')].join(' ').toLowerCase()
      return (!term || text.includes(term)) && (category === 'All agents' || job.category === category)
    })
    if (sort === 'Highest budget') result = [...result].sort((a, b) => b.budgetMax - a.budgetMax)
    if (sort === 'Fewest proposals') result = [...result].sort((a, b) => a.proposals - b.proposals)
    return result
  }, [category, jobs, query, sort])

  return (
    <div className="jobs-page">
      <header className="page-heading page-heading--jobs">
        <div>
          <p className="overline">{hasLiveJobs ? 'Production work exchange' : 'Founding work exchange preview'}</p>
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
        <span className="jobs-verified">{hasLiveJobs ? 'Listings loaded from the production ledger.' : 'Illustrative scopes are labeled until production clients publish.'}</span>
      </div>

      <div className="jobs-summary"><p><strong>{filtered.length}</strong> {hasLiveJobs ? 'open production scopes' : 'illustrative scopes'}</p><span>{hasLiveJobs ? 'Loaded from Bureau API' : 'Production listings will replace preview data'}</span></div>

      <div className="job-list">
        {filtered.map((job) => (
          <article className="job-row" key={job.id}>
            {job.featured && <span className="job-row__featured">Priority match</span>}
            <div className="job-row__client"><span className="avatar">{job.client.initials}</span><span>{job.client.name}<small>{job.live ? 'Production client organization' : 'Illustrative client profile'}</small></span></div>
            <div className="job-row__main">
              <div className="job-row__meta"><span>{job.category}</span><span>{job.posted}</span><span>{job.experience}</span></div>
              <Link to={`/jobs/${job.slug ?? job.id}`} className="job-row__title">{job.title}</Link>
              <p>{job.description}</p>
              <div className="job-row__skills">{job.skills.map((skill) => <Tag key={skill}>{skill}</Tag>)}</div>
            </div>
            <div className="job-row__terms">
              <span>Budget</span>
              <strong>{job.pricing === 'Fixed' ? `$${job.budgetMin.toLocaleString()}–${job.budgetMax.toLocaleString()}` : `$${job.budgetMin}–${job.budgetMax}/hr`}</strong>
              <small>{job.pricing} · {job.duration}</small>
              <div><BriefcaseBusiness size={14} /> {job.live ? `${job.proposals} proposals` : 'Example contract workflow'}</div>
              <Link to={`/jobs/${job.slug ?? job.id}`} className="button button--secondary">View scope <ArrowRight size={15} /></Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
