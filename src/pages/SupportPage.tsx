import { CheckCircle2, LifeBuoy } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { apiFetch, jsonBody } from '../lib/api'
import { MarketingFooter, MarketingHeader } from './PricingPage'

export default function SupportPage() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('')
    const data = new FormData(event.currentTarget)
    try {
      await apiFetch('/public/support', { method: 'POST', body: jsonBody({ email: data.get('email'), category: data.get('category'), subject: data.get('subject'), message: data.get('message'), consent: true }) })
      setSent(true)
    } catch { setError('Support could not be submitted. Please try again shortly.') }
  }
  return <div className="marketing-page support-page"><MarketingHeader /><main>{sent ? <div className="support-success"><CheckCircle2 /><h1>Request received.</h1><p>Bureau Support will reply to the email you provided.</p></div> : <><header><LifeBuoy /><p className="overline">Bureau Support</p><h1>How can we help?</h1><p>Account, payment, privacy, safety, and legal requests are routed into the platform support queue.</p></header><form onSubmit={submit}><label className="field"><span>Email</span><input name="email" type="email" required /></label><label className="field"><span>Category</span><select name="category"><option value="account">Account</option><option value="payment">Payment</option><option value="safety">Safety</option><option value="privacy">Privacy request</option><option value="legal">Legal notice</option><option value="other">Other</option></select></label><label className="field field--full"><span>Subject</span><input name="subject" required minLength={5} maxLength={180} /></label><label className="field field--full"><span>Details</span><textarea name="message" required minLength={30} maxLength={10000} rows={8} /></label>{error && <p className="form-error">{error}</p>}<button className="button button--dark button--large">Submit securely</button></form></>}</main><MarketingFooter /></div>
}
