import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useContactCapture } from '@/components/ContactCapture';
const notice={noticeVersion:'fixture-v1',disclosure:'Synthetic notice',privacyUrl:'https://example.test/privacy'};
function Harness({done}:{done:()=>void}){const c=useContactCapture(notice);return <><button disabled={c.pending} onClick={async()=>{if(await c.capture('synthetic@example.test'))done();}}>Continue</button><p role="alert">{c.error}</p></>;}
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
it('times out a stalled transport, ignores late success and retries the same request ID',async()=>{
 vi.useFakeTimers();let finish!:(r:Response)=>void;const done=vi.fn();
 const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(r=>{finish=r;})).mockResolvedValueOnce(Response.json({captured:true}));vi.stubGlobal('fetch',fetcher);
 render(<Harness done={done}/>);fireEvent.click(screen.getByRole('button'));
 await act(async()=>{await vi.advanceTimersByTimeAsync(12001);});expect(screen.getByRole('alert').textContent).toContain('timed out');expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
 await act(async()=>finish(Response.json({captured:true})));expect(done).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button'));await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
 expect(done).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
});
it('unmount aborts capture and late confirmation cannot continue an old quiz',async()=>{
 let finish!:(r:Response)=>void;const done=vi.fn();const fetcher=vi.fn(()=>new Promise(r=>{finish=r;}));vi.stubGlobal('fetch',fetcher);
 const view=render(<Harness done={done}/>);fireEvent.click(screen.getByRole('button'));view.unmount();
 await act(async()=>finish(Response.json({captured:true})));expect(done).not.toHaveBeenCalled();expect((fetcher.mock.calls as unknown[][])[0][1]).toMatchObject({signal:expect.objectContaining({aborted:true})});
});
it('a new intentional submission gets a new request ID after confirmed success',async()=>{
 const done=vi.fn(),fetcher=vi.fn(async()=>Response.json({captured:true}));vi.stubGlobal('fetch',fetcher);render(<Harness done={done}/>);
 await act(async()=>fireEvent.click(screen.getByRole('button')));await act(async()=>fireEvent.click(screen.getByRole('button')));
 expect(done).toHaveBeenCalledTimes(2);const calls=fetcher.mock.calls as unknown as [string,{body:string}][];expect(JSON.parse(calls[0][1].body).requestId).not.toBe(JSON.parse(calls[1][1].body).requestId);
});
