import sys, numpy as np, torch, collections
from tools.ml.bp_torch import *
from tools.ml.train.data import frame_labels, DT
from tools.ml.factory import store
name=sys.argv[1]; r=store.Reader(name); m=BasicPitch().cuda().eval()
agg=collections.defaultdict(lambda: np.zeros(6))
lagacc=collections.defaultdict(list)
step=max(1,len(r.items)//int(sys.argv[2]))
for it in r.items[::step]:
    tk=r.takes[it['take']]
    key=(tk.get('exercise','').split('.')[1] if tk.get('exercise','').startswith('drill') else tk.get('group',tk.get('source'))) + '|' + it['chain']['kind']
    a=r.audio[it['offset']:it['offset']+it['samples']].astype(np.float32)/32768
    nw=max(1,(len(a)-WINDOW)//WINDOW+1)
    xs=np.stack([np.pad(a[i*WINDOW:(i+1)*WINDOW],(0,WINDOW-len(a[i*WINDOW:(i+1)*WINDOW]))) for i in range(nw)])
    with torch.no_grad(): n,o=m(torch.from_numpy(xs).cuda())
    n=n.cpu().numpy(); o=o.cpu().numpy()
    for i in range(nw):
        ln,lo=frame_labels(tk['notes'], i*WINDOW/RATE)
        p=n[i]>0.4; t=ln>0.5
        agg[key][:3]+= [(p&t).sum(), p.sum(), t.sum()]
        po=o[i]>0.4; 
        # onset recall within +-2 frames
        js,cs=np.where(lo>=1.0)
        hit=sum(1 for j,c in zip(js,cs) if o[i][max(0,j-2):j+3,c].max()>0.4)
        agg[key][3:5]+=[hit,len(js)]
        for j,c in zip(js,cs):
            w=o[i][max(0,j-4):j+5,c]
            if w.max()>0.5 and j>=4 and j<FRAMES-5: lagacc[key].append(int(np.argmax(w))-4)
for k in sorted(agg):
    v=agg[k]; print(f"{k:32s} note P {v[0]/max(1,v[1]):.2f} R {v[0]/max(1,v[2]):.2f}  onset R {v[3]/max(1,v[4]):.2f} (n={int(v[4])}) lag frames {np.mean(lagacc[k]) if lagacc[k] else float('nan'):+.2f}")
