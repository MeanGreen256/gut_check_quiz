import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import QuizApp from '@/components/QuizApp';
import { QUESTIONS } from '@/lib/quiz-data';
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(window.location.search)}));
vi.mock('@vercel/analytics',()=>({track:vi.fn()}));
const notice={noticeVersion:'fixture-v1',disclosure:'Synthetic central capture disclosure.',privacyUrl:'https://example.test/privacy'};
const fetcher=vi.fn();
beforeEach(()=>{window.history.replaceState({},'', '/');vi.stubGlobal('fetch',fetcher);fetcher.mockReset();vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));vi.stubGlobal('scrollTo',vi.fn());});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function lead(){
 fireEvent.click(screen.getByRole('button',{name:/Start the check/}));
 for(const q of QUESTIONS)fireEvent.click(screen.getByRole('button',{name:q.options[0].text}));
 fireEvent.change(screen.getByLabelText('First name'),{target:{value:'Synthetic'}});
 fireEvent.change(screen.getByLabelText('Email'),{target:{value:'synthetic@example.test'}});
}
it.each([false,true])('central capture is separate from existing newsletter choice consent=%s',async(consent)=>{
 fetcher.mockImplementation(async()=>Response.json({captured:true}));
 render(<QuizApp contactNotice={notice}/>);lead();
 if(consent)fireEvent.click(screen.getByRole('checkbox'));
 fireEvent.click(screen.getByRole('button',{name:/Show my results/}));
 await waitFor(()=>expect(screen.queryByRole('button',{name:/Show my results/})).toBeNull());
 const capture=fetcher.mock.calls.find(([url])=>url==='/api/contact-capture');
 expect(Object.keys(JSON.parse(capture![1].body)).sort()).toEqual(['email','noticeVersion','requestId']);
 expect(fetcher.mock.calls.filter(([url])=>url==='/api/subscribe')).toHaveLength(consent?1:0);
 expect(fetcher.mock.calls.filter(([url])=>url==='/api/summary')).toHaveLength(1);
});
it('disabled integration preserves original results and no-consent behavior without central traffic',async()=>{
 fetcher.mockImplementation(async()=>new Response('{}',{status:503}));render(<QuizApp/>);lead();
 fireEvent.click(screen.getByRole('button',{name:/Show my results/}));
 expect(screen.queryByRole('button',{name:/Show my results/})).toBeNull();
 expect(fetcher.mock.calls.some(([url])=>url==='/api/contact-capture'||url==='/api/subscribe')).toBe(false);
});
it('retry preserves consent and idempotency, and no newsletter/summary is sent on capture failure',async()=>{
 let attempts=0;fetcher.mockImplementation(async(url)=>url==='/api/contact-capture'&&++attempts===1?Response.json({error:'Retry capture'},{status:503}):Response.json({captured:true}));
 render(<QuizApp contactNotice={notice}/>);lead();fireEvent.click(screen.getByRole('checkbox'));
 fireEvent.click(screen.getByRole('button',{name:/Show my results/}));await screen.findByRole('alert');
 expect(fetcher.mock.calls).toHaveLength(1);expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:/Show my results/}));
 await waitFor(()=>expect(fetcher.mock.calls.filter(([url])=>url==='/api/subscribe')).toHaveLength(1));
 const captures=fetcher.mock.calls.filter(([url])=>url==='/api/contact-capture');expect(captures[0][1].body).toBe(captures[1][1].body);
});

it('approved capture cannot be skipped through the public dev-results URL',()=>{
 window.history.replaceState({},'', '/?dev=results&type=thriving');render(<QuizApp contactNotice={notice}/>);
 expect(screen.getByRole('button',{name:/Start the check/})).toBeTruthy();expect(fetcher).not.toHaveBeenCalled();
});
