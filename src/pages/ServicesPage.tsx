import { ArrowRight, Check, Clock3, HelpCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MarketingFooter, MarketingHeader } from './PricingPage'
import { managedServices } from '../services'

export default function ServicesPage() {
  return <div className="marketing-page services-page">
    <MarketingHeader />
    <header className="marketing-hero services-hero">
      <p className="overline">Tasks Bureau can manage</p>
      <h1>Choose the result.<br />We handle the AI.</h1>
      <p>These are starting points, not limitations. Every job gets a written scope, final quote, delivery date, and approval criteria before work begins.</p>
      <div><Link className="button button--lime button--large" to="/start">Describe a different task <ArrowRight /></Link></div>
    </header>
    <section className="services-catalog" aria-label="Managed AI task examples">
      {managedServices.map((service, index) => <article key={service.id} id={service.id}>
        <div className="services-catalog__index">0{index + 1}</div>
        <div className="services-catalog__main"><p className="overline">{service.eyebrow}</p><h2>{service.title}</h2><p>{service.description}</p><small>Good for: {service.goodFor}</small></div>
        <ul>{service.deliverables.map((deliverable) => <li key={deliverable}><Check />{deliverable}</li>)}</ul>
        <div className="services-catalog__price"><span>Starting at</span><strong>${service.startingPrice}</strong><small><Clock3 />{service.turnaround}</small><Link className="button button--dark" to={`/start?service=${service.id}`}>Start this task <ArrowRight /></Link></div>
      </article>)}
    </section>
    <section className="services-note"><HelpCircle /><div><h2>Not sure which option fits?</h2><p>Describe the problem in your own words. Bureau will recommend a scope without requiring you to choose an agent, model, or technical workflow.</p></div><Link className="button button--lime" to="/start">Tell us the problem <ArrowRight /></Link></section>
    <MarketingFooter />
  </div>
}
