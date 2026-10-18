/* ═════════════════════════════════════════════════════════════════════════
   Brandi's Universe — solar system, comets, shooting stars, asteroids, galaxies
   • Every planet texture is painted procedurally on the GPU at load (no image downloads).
   • Runtime shaders are tiny (texture + sun lighting), so this is cheap on Quest.
   ═════════════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

/* ─────────────────────────────────────────────────────────────────────────
   1. BAKE SHADER  (WebGL2, runs once per texture, equirectangular output)
   ───────────────────────────────────────────────────────────────────────── */
const BAKE_VERT=`#version 300 es
void main(){
  vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  gl_Position=vec4(p*2.0-1.0,0.0,1.0);
}`;

const BAKE_FRAG=`#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform int  uType;
uniform float uSeed;
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC;
uniform sampler2D uMask;
const float PI=3.14159265359;

float hash13(vec3 p3){p3=fract(p3*.1031);p3+=dot(p3,p3.zyx+31.32);return fract((p3.x+p3.y)*p3.z);}
vec3 hash33(vec3 p3){p3=fract(p3*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yxz+33.33);return fract((p3.xxy+p3.yxx)*p3.zyx);}
float vnoise(vec3 x){
  vec3 i=floor(x),f=fract(x);f=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(mix(hash13(i),hash13(i+vec3(1,0,0)),f.x),mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),f.x),mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p,int oct){
  float a=.5,s=0.,n=0.;
  for(int i=0;i<8;i++){ if(i>=oct)break; s+=a*vnoise(p); n+=a; p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; }
  return s/n;
}
// cell-based craters: bowl + raised rim
float craterField(vec3 p,float scale,float density){
  vec3 q=p*scale; vec3 i=floor(q); vec3 f=fract(q); float h=0.;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){
    vec3 g=vec3(float(x),float(y),float(z));
    if(hash13(i+g+11.7)>density) continue;
    vec3 o=hash33(i+g);
    float dist=length(g+o-f);
    float rad=.16+.30*hash13(i+g+3.3);
    float t=dist/rad;
    h+= -(1.-smoothstep(0.,1.,t))*step(t,1.)*.95 + exp(-pow((t-1.05)*6.,2.))*.5;
  }
  return h;
}
// 3D cellular distance (sun granulation)
float worley(vec3 p){
  vec3 i=floor(p),f=fract(p); float m=8.;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){
    vec3 g=vec3(float(x),float(y),float(z));
    m=min(m,length(g+hash33(i+g)-f));
  }
  return m;
}

vec3 mercury(vec3 d){
  vec3 s=d+uSeed;
  float h=craterField(s,5.,.75)*.8+craterField(s*1.7,14.,.6)*.55+craterField(s*2.3,36.,.5)*.35;
  float n=fbm(s*4.,5);
  vec3 c=mix(uA,uB,n)*(1.+h*.5);
  c*=.88+.24*fbm(s*22.,3);
  return c;
}
vec3 moonSurf(vec3 d){
  vec3 s=d+uSeed;
  float mare=smoothstep(.50,.60,fbm(s*1.7,5))*(1.-smoothstep(.0,.2,fbm(s*6.,3)-.62));
  float h=craterField(s,6.,.6)*.7+craterField(s*1.9,16.,.6)*.5+craterField(s*2.6,40.,.5)*.3;
  vec3 c=mix(uB,uA,mare*.9)*(.86+.28*fbm(s*9.,4));
  c*=1.+h*.45;
  float ray=smoothstep(.78,.9,hash13(floor(s*60.)))*.0;
  return c+ray;
}
vec3 venus(vec3 d){
  vec3 p=d*2.2+uSeed;
  vec3 w=vec3(fbm(p+vec3(0.,0.,1.),4),fbm(p+vec3(5.2,1.3,2.),4),fbm(p+vec3(9.1,3.7,4.),4));
  float n=fbm(p*1.6+w*2.4,5);
  float bands=sin(d.y*9.+w.x*3.5)*.5+.5;
  vec3 c=mix(uA,uB,clamp(n*.75+bands*.25,0.,1.)*uC.x+(1.-uC.x)*.5);
  c*=.92+.16*fbm(vec3(d.x*2.,d.y*14.,d.z*2.)+w,4);
  return c;
}
vec3 mars(vec3 d){
  float lat=asin(d.y);
  vec3 p=d*2.+uSeed;
  float big=fbm(p*1.3,5);
  float dark=smoothstep(.53,.68,fbm(p*1.1+vec3(7.,2.,1.),5));
  vec3 c=mix(mix(uA,uB,big),uC,dark*.6);
  float h=craterField(d+uSeed,9.,.5)*.4+craterField(d+uSeed,24.,.5)*.3;
  c*=1.+h*.42;
  c*=.9+.2*fbm(d*34.,3);
  float edge=1.27+.10*(fbm(d*6.,3)-.5);
  c=mix(c,vec3(.94,.94,.96),smoothstep(edge,edge+.04,abs(lat)));
  return c;
}
// Jupiter-style banded palette (south pole -> north pole)
const vec3 JP[15]=vec3[15](
  vec3(.44,.41,.42),vec3(.62,.50,.40),vec3(.86,.79,.66),vec3(.56,.38,.28),vec3(.89,.83,.71),
  vec3(.73,.46,.31),vec3(.94,.89,.79),vec3(.78,.54,.37),vec3(.92,.86,.74),vec3(.60,.38,.26),
  vec3(.90,.84,.72),vec3(.70,.50,.36),vec3(.86,.78,.66),vec3(.58,.50,.45),vec3(.44,.42,.43));
vec3 jupiterPal(float t){
  float k=clamp(t,0.,.9999)*14.; int i=int(floor(k)); float f=smoothstep(0.,1.,fract(k));
  return mix(JP[i],JP[i+1],f);
}
float angDiff(float a,float b){return mod(a-b+PI,2.*PI)-PI;}
vec3 jupiter(vec3 d){
  float lat=asin(d.y); float lon=atan(d.z,d.x);
  vec2 cs=vec2(cos(lon),sin(lon));
  float ln0=-.35;           // spot latitude
  float spotLon=2.2;
  float dx=angDiff(lon,spotLon)*cos(ln0)/.30, dy=(lat-ln0)/.135;
  float r2=dx*dx+dy*dy;
  // jets: shear the latitude coordinate so bands wobble and wrap the spot
  float warp=(fbm(vec3(cs*1.3,lat*7.),4)-.5)*.10 + (fbm(vec3(cs*3.,lat*18.),4)-.5)*.045 + .010*sin(lon*13.+lat*40.)*smoothstep(.3,.0,abs(lat+.12));
  warp+=.07*exp(-r2*.55)*sign(dy)*(1.-exp(-r2*.3));
  float t=(lat+warp)/PI+.5;
  vec3 c=jupiterPal(t);
  float streak=fbm(vec3(cs*2.2,lat*26.),5);
  c*=.78+.42*streak;
  float turb=smoothstep(.46,.72,fbm(vec3(cs*6.5,lat*58.)+uSeed,5));
  c=mix(c,c*vec3(1.10,.97,.86)+.05,turb*.5);
  float ov=smoothstep(.72,.8,fbm(vec3(cs*9.,lat*70.)+3.,4))*smoothstep(.45,.2,abs(lat+.5));
  c=mix(c,vec3(.96,.93,.86),ov*.5);
  // Great Red Spot
  float ang=atan(dy,dx)+r2*2.2;
  float swirl=.5+.5*sin(ang*3.+fbm(vec3(dx,dy,2.)*3.,3)*5.);
  vec3 spot=mix(vec3(.62,.27,.18),vec3(.80,.46,.32),swirl*.8);
  float inside=1.-smoothstep(.62,1.0,r2);
  c=mix(c,spot,inside);
  float collar=smoothstep(1.,1.25,r2)*(1.-smoothstep(1.25,1.9,r2));
  c=mix(c,vec3(.93,.86,.74),collar*.55);
  return c;
}
vec3 saturnPlanet(vec3 d){
  float lat=asin(d.y); float lon=atan(d.z,d.x); vec2 cs=vec2(cos(lon),sin(lon));
  float s=fbm(vec3(cs*1.2,lat*12.),5);
  float band=.5+.5*sin(lat*24.+s*3.2);
  float fine=fbm(vec3(cs*3.,lat*40.)+uSeed,4);
  vec3 c=mix(uA,uB,clamp(band*.6+fine*.4,0.,1.));
  c*=.93+.14*fbm(vec3(cs*2.,lat*60.),3);
  c=mix(c,uC,smoothstep(.95,1.5,abs(lat)));    // dusky poles
  return c;
}
vec3 uranus(vec3 d){
  float lat=asin(d.y);
  float b=.5+.5*sin(lat*9.+fbm(d*3.,3)*2.);
  vec3 c=mix(uA,uB,.35+b*.25+smoothstep(.9,1.5,abs(lat))*.4);
  return c*(.97+.06*fbm(d*8.,3));
}
vec3 neptune(vec3 d){
  float lat=asin(d.y); float lon=atan(d.z,d.x); vec2 cs=vec2(cos(lon),sin(lon));
  float b=fbm(vec3(cs*1.4,lat*10.),4);
  vec3 c=mix(uA,uB,b*.8+.1*sin(lat*14.));
  float dx=angDiff(lon,1.0)*cos(-.35)/.34, dy=(lat+.35)/.17; float r2=dx*dx+dy*dy;
  c=mix(c,uC,(1.-smoothstep(.5,1.,r2))*.85);
  float cir=smoothstep(.66,.84,fbm(vec3(cs*2.2,lat*20.)+uSeed,5))*(1.-smoothstep(.3,1.2,abs(lat+.1)));
  c=mix(c,vec3(.82,.9,1.),cir*.55);
  return c;
}
vec3 sunTex(vec3 d){
  vec3 p=d+uSeed;
  float w1=worley(p*14.); float w2=worley(p*30.+4.);
  float cell=1.-smoothstep(.0,.85,w1);
  float fine=1.-smoothstep(.0,.7,w2);
  float plasma=fbm(p*5.,5);
  float v=.62+.26*cell+.10*fine+.22*(plasma-.5);
  vec3 c=mix(vec3(.95,.38,.07),vec3(1.,.93,.62),clamp(v,0.,1.));
  float spots=smoothstep(.72,.85,fbm(p*2.6+9.,4))*(1.-smoothstep(.35,.9,abs(asin(d.y))*1.8));
  c=mix(c,vec3(.25,.07,.02),spots*.85);
  return c*(.9+.35*clamp(v,0.,1.));
}
vec3 ioSurf(vec3 d){
  vec3 s=d+uSeed;
  float a=fbm(s*3.,5), b=fbm(s*9.+4.,4);
  vec3 c=mix(uA,uB,a);
  c=mix(c,vec3(.78,.35,.12),smoothstep(.55,.7,b)*.7);
  c=mix(c,vec3(.14,.08,.05),smoothstep(.80,.86,fbm(s*12.+8.,3))*.6);
  return c;
}
vec3 europaSurf(vec3 d){
  vec3 s=d+uSeed;
  float base=fbm(s*3.,4);
  vec3 c=mix(uA,uB,base);
  float line=1.-smoothstep(0.,.03,abs(fbm(s*6.,5)-.5));
  float line2=1.-smoothstep(0.,.02,abs(fbm(s*13.+3.,4)-.5));
  c=mix(c,vec3(.55,.33,.22),clamp(line*.8+line2*.5,0.,1.)*.75);
  return c;
}

vec3 earthDay(vec3 d,vec2 uv){
  float alat=abs(asin(d.y))*180./PI;
  vec2 off=(vec2(fbm(d*9.,4),fbm(d*9.+vec3(5.,2.,7.),4))-.5)*.016;
  float m=texture(uMask,uv+off).r;
  float fine=(fbm(d*45.,4)-.5)*.17+(fbm(d*14.,4)-.5)*.15;
  float land=smoothstep(.465,.535,m+fine);
  float shelf=smoothstep(.12,.52,m+fine*.5);
  vec3 ocean=mix(vec3(.02,.07,.25),vec3(.08,.32,.44),shelf*shelf);
  ocean*=.9+.2*fbm(d*6.,3);
  float moist=fbm(d*3.+vec3(3.,1.,2.),5);
  float dryBand=smoothstep(8.,20.,alat)*(1.-smoothstep(28.,44.,alat));
  float desert=clamp(dryBand*(.55+1.0*(fbm(d*4.+vec3(8.),5)-.4)),0.,1.);
  vec3 forest=vec3(.06,.19,.07),grass=vec3(.27,.35,.14),sand=vec3(.74,.61,.38),tundra=vec3(.42,.43,.36),rock=vec3(.36,.32,.28);
  vec3 lc=mix(forest,grass,smoothstep(.38,.66,moist));
  lc=mix(lc,sand,desert);
  lc=mix(lc,vec3(.04,.16,.06),(1.-smoothstep(0.,15.,alat))*smoothstep(.42,.58,moist));
  lc=mix(lc,tundra,smoothstep(50.,64.,alat));
  lc=mix(lc,rock,smoothstep(.58,.78,fbm(d*10.,5))*.55);
  lc*=.86+.28*fbm(d*60.,3);
  vec3 c=mix(ocean,lc,land);
  float iceEdge=70.+8.*(fbm(d*5.,3)-.5);
  float ice=max(smoothstep(iceEdge,iceEdge+3.,alat),land*smoothstep(60.,73.,alat)*.95);
  c=mix(c,vec3(.93,.95,.98),ice);
  return c;
}
vec3 earthLights(vec3 d,vec2 uv){
  float alat=abs(asin(d.y))*180./PI;
  float land=smoothstep(.5,.58,texture(uMask,uv).r);
  float cl=pow(fbm(d*26.+3.,4),3.2)*3.2 + pow(fbm(d*80.,3),3.)*1.2;
  float v=land*cl*(1.-smoothstep(52.,68.,alat))*smoothstep(0.,6.,alat+8.);
  return vec3(1.,.78,.46)*clamp(v,0.,1.4);
}
float cloudField(vec3 d){
  vec3 p=d*3.+uSeed;
  vec3 w=vec3(fbm(p+vec3(1.),4),fbm(p+vec3(7.,3.,2.),4),fbm(p+vec3(4.,8.,5.),4));
  float c=fbm(p*1.4+w*1.7,6);
  float lat=abs(asin(d.y));
  float bias=.16*exp(-pow((lat-.85)*3.,2.))+.12*exp(-pow(lat*5.,2.));
  return smoothstep(.55-bias,.84,c);
}
vec3 galaxy(vec2 uv){
  vec2 p=(uv-.5)*2.; float r=length(p); float a=atan(p.y,p.x);
  float arm=sin(2.*(a-log(r+.03)*3.1)+uSeed*6.);
  float dens=pow(.5+.5*arm,2.2)*exp(-r*2.5);
  float n=fbm(vec3(p*7.,uSeed),5);
  dens*=.55+.9*n;
  float core=exp(-r*r*22.)*1.5;
  float dust=smoothstep(.2,.6,.5+.5*sin(2.*(a-log(r+.03)*3.1)+uSeed*6.+.9))*exp(-r*2.)*.45;
  vec3 c=vec3(.55,.72,1.)*dens*1.5+vec3(1.,.82,.58)*core+vec3(1.,.45,.7)*pow(dens,3.)*.8;
  c*=1.-dust;
  float st=step(.997,hash13(vec3(floor(uv*512.),uSeed)))*exp(-r*1.4);
  c+=vec3(st);
  return c*smoothstep(1.,.72,r);
}

void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  float lon=(uv.x*2.-1.)*PI;
  float lat=(uv.y*2.-1.)*PI*.5;
  vec3 d=vec3(cos(lat)*cos(lon),sin(lat),cos(lat)*sin(lon));
  vec3 col=vec3(0.);
  if(uType==0)      col=mercury(d);
  else if(uType==1) col=moonSurf(d);
  else if(uType==2) col=venus(d);
  else if(uType==3) col=earthDay(d,uv);
  else if(uType==4) col=earthLights(d,uv);
  else if(uType==5) col=vec3(cloudField(d));
  else if(uType==6) col=mars(d);
  else if(uType==7) col=jupiter(d);
  else if(uType==8) col=saturnPlanet(d);
  else if(uType==9) col=uranus(d);
  else if(uType==10)col=neptune(d);
  else if(uType==11)col=sunTex(d);
  else if(uType==12)col=ioSurf(d);
  else if(uType==13)col=europaSurf(d);
  else if(uType==20)col=galaxy(uv);
  outColor=vec4(clamp(col,0.,1.5),1.);
}`;

/* ─────────────────────────────────────────────────────────────────────────
   2. EARTH LAND MASK  (rough continent outlines, roughened by noise in the bake)
   ───────────────────────────────────────────────────────────────────────── */
const LAND=[
 // North America
 [[-168,66],[-157,71],[-140,70],[-128,70],[-115,69],[-95,70],[-82,68],[-78,58],[-92,57],[-85,52],[-80,51],[-78,57],[-70,60],[-61,56],[-55,50],[-65,44],[-70,42],[-75,38],[-81,31],[-80,25],[-83,29],[-90,29],[-97,27],[-98,20],[-91,19],[-87,21],[-88,16],[-83,15],[-83,10],[-79,8],[-83,8],[-86,12],[-92,14],[-96,16],[-105,20],[-110,26],[-114,31],[-117,32],[-121,35],[-124,40],[-124,48],[-130,54],[-137,58],[-148,60],[-153,58],[-160,56],[-165,60]],
 // Greenland
 [[-55,60],[-45,60],[-40,65],[-22,70],[-20,78],[-30,83],[-55,82],[-70,78],[-58,70],[-52,65]],
 // South America
 [[-80,9],[-72,12],[-62,10],[-52,5],[-50,0],[-35,-5],[-35,-9],[-39,-15],[-41,-22],[-48,-26],[-53,-34],[-58,-38],[-62,-40],[-65,-45],[-68,-52],[-70,-55],[-74,-52],[-74,-45],[-73,-37],[-71,-30],[-70,-18],[-76,-14],[-81,-6],[-80,-1],[-78,6]],
 // Africa
 [[-17,21],[-13,28],[-6,35],[10,37],[20,32],[32,31],[35,27],[43,12],[51,12],[41,-2],[40,-15],[35,-24],[32,-29],[26,-34],[18,-34],[12,-18],[13,-6],[9,3],[5,5],[-8,4],[-13,8],[-17,14]],
 // Eurasia
 [[-9,37],[-9,43.5],[-2,43.5],[-1.5,46],[-4.5,48.5],[2,51],[5,53],[8,54],[8.5,57],[10.5,57.5],[10.5,55],[12,54.5],[14,54],[19,54.5],[21,57],[24,59],[30,60],[23,60.5],[21.5,62],[25,65],[21,65],[17.5,62.5],[18,59.5],[16,56],[13,55.5],[11,58],[8,58],[5,59],[5,62],[10,64],[14,67],[19,70],[26,71],[31,70],[41,67],[35,66],[40,64.5],[44,66],[44,68],[55,68.5],[60,69],[68,69],[66,71],[72,73],[80,73],[87,75],[100,77],[105,77.5],[113,74],[125,73],[135,71.5],[150,71],[160,69.5],[170,70],[180,69],[180,65],[170,60],[162,60],[160,54],[156,51],[155,57],[150,59],[143,59],[137,54],[141,52],[140,48],[135,43],[131,42.5],[129,40],[129,35],[126.5,34.5],[126,37],[125,39.5],[122,40],[121,39],[121,37.5],[119,37],[122,36.8],[119,35],[121.5,31],[122,29],[120,26],[117,23.5],[113,22],[110,20.5],[108,21.5],[106,19],[109,15],[108.5,11.5],[105,8.7],[104.8,10.5],[102,12],[100.5,13.5],[99.5,10],[100.5,6.5],[103.5,4],[103.5,1.5],[101,3],[98.5,8],[98.5,13],[97.5,16.5],[94.5,16],[94,19],[92,21.5],[90,22],[87,21.3],[85,19.5],[80.5,15.5],[80,10.5],[77.5,8],[76,10.5],[73.5,16.5],[72.8,20],[70,21],[68,23.5],[66.5,25.3],[62,25],[57.5,25.8],[56.3,27],[54,26.7],[50.5,29.5],[48,30],[48.5,28],[50,26.3],[51.5,24.5],[54,24],[56.4,26],[56.8,24.2],[59.8,22.5],[58.5,20],[55,17],[52,16],[48,14],[45,12.8],[43,13],[42,16],[39,21],[35.5,27.5],[34.5,28.5],[34.2,31.2],[35.5,33.5],[36,36],[32,36.2],[30,36.4],[27,37.5],[26.5,40.5],[24,40.5],[23,38],[22,36.5],[21,38],[19.5,41],[19,42],[15.5,44.5],[13.5,45.5],[12.5,44],[14,42],[16,41],[18.5,40.2],[16,38],[15.7,40],[12,42],[10,44],[8,44],[4,43.3],[3,42],[0,39],[-.5,38],[-2,36.8],[-5,36],[-6.5,37]],
 // Australia
 [[114,-22],[122,-18],[130,-12],[137,-12],[142,-11],[146,-19],[153,-26],[150,-37],[141,-38],[135,-34],[129,-32],[116,-35],[113,-26]],
 // Antarctica
 [[-180,-90],[180,-90],[180,-78],[160,-70],[120,-66],[90,-67],[60,-68],[30,-70],[0,-70],[-30,-72],[-60,-64],[-75,-72],[-110,-74],[-150,-78],[-180,-78]],
 // islands
 [[95,5],[98,4],[106,-4],[104,-6],[98,0]],                                  // Sumatra
 [[109,1],[114,4],[119,5],[118,-1],[115,-4],[110,-3]],                      // Borneo
 [[105,-6],[114,-8],[106,-7]],                                              // Java
 [[131,-1],[141,-3],[150,-10],[142,-9],[135,-4]],                           // New Guinea
 [[131,34],[135,35],[140,38],[142,42],[140,41],[136,36]],                   // Japan
 [[-5,50],[1,51],[2,53],[-2,57],[-5,58],[-6,56],[-3,54],[-5,52]],          // Great Britain
 [[-10,52],[-6,52],[-6,55],[-10,54]],                                       // Ireland
 [[44,-25],[47,-25],[50,-15],[49,-12],[44,-17]],                            // Madagascar
 [[172,-34],[178,-38],[175,-41],[172,-41]],                                 // NZ north
 [[172,-41],[174,-42],[171,-46],[167,-46]],                                 // NZ south
 [[-24,64],[-14,64],[-14,66],[-23,66]],                                     // Iceland
 [[-85,22],[-74,20],[-77,22]],                                              // Cuba
 [[-125,50],[-122,49],[-124,48]]                                            // Vancouver Island-ish
];
const WATER=[
 [[28,41.2],[28,44],[30,46],[33,46],[36,45],[41,43],[41.5,41.5],[35,42],[31,41.2]],   // Black Sea
 [[47,45],[53,47],[54,41],[53,37],[50,37.5],[49,40],[47,42]],                           // Caspian
 [[-95,49],[-88,49],[-82,46],[-85,43],[-92,47]]                                         // Great Lakes
];
function makeEarthMask(w,h){
  const c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d");
  x.fillStyle="#000";x.fillRect(0,0,w,h);
  const P=([lo,la])=>[(lo+180)/360*w,(90-la)/180*h];
  const poly=(pts,fill)=>{x.fillStyle=fill;x.beginPath();pts.forEach((p,i)=>{const q=P(p);i?x.lineTo(q[0],q[1]):x.moveTo(q[0],q[1])});x.closePath();x.fill()};
  LAND.forEach(p=>poly(p,"#fff"));
  WATER.forEach(p=>poly(p,"#000"));
  const out=document.createElement("canvas");out.width=w;out.height=h;const o=out.getContext("2d");
  o.filter="blur("+Math.max(1,Math.round(w/380))+"px)";o.drawImage(c,0,0);o.filter="none";
  return out;
}

/* ─────────────────────────────────────────────────────────────────────────
   3. BAKER (own tiny WebGL2 context → copies into 2D canvases)
   ───────────────────────────────────────────────────────────────────────── */
function createBaker(){
  const cv=document.createElement("canvas");
  const gl=cv.getContext("webgl2",{preserveDrawingBuffer:true,antialias:false,alpha:false,depth:false,stencil:false});
  if(!gl)return null;
  const sh=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error("bake shader: "+log)}return s};
  const prog=gl.createProgram();
  gl.attachShader(prog,sh(gl.VERTEX_SHADER,BAKE_VERT));gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,BAKE_FRAG));
  gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error("bake link: "+gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const U={};["uRes","uType","uSeed","uA","uB","uC","uMask"].forEach(n=>U[n]=gl.getUniformLocation(prog,n));
  const maskTex=gl.createTexture();
  let maskSrc=null;
  return {
    bake(type,w,h,o){
      o=o||{};
      cv.width=w;cv.height=h;gl.viewport(0,0,w,h);
      gl.uniform2f(U.uRes,w,h);gl.uniform1i(U.uType,type);gl.uniform1f(U.uSeed,o.seed||0);
      gl.uniform3fv(U.uA,o.A||[.5,.5,.5]);gl.uniform3fv(U.uB,o.B||[.8,.8,.8]);gl.uniform3fv(U.uC,o.C||[.3,.3,.3]);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,maskTex);
      if(o.mask&&o.mask!==maskSrc){
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,o.mask);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        maskSrc=o.mask;
      }
      gl.uniform1i(U.uMask,0);
      gl.drawArrays(gl.TRIANGLES,0,3);
      const out=document.createElement("canvas");out.width=w;out.height=h;
      out.getContext("2d").drawImage(cv,0,0);
      return out;
    },
    dispose(){const e=gl.getExtension("WEBGL_lose_context");if(e)e.loseContext()}
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   4. RUNTIME SHADERS (three.js ShaderMaterial, GLSL1-style)
   ───────────────────────────────────────────────────────────────────────── */
const PLANET_VERT=`
varying vec2 vUv; varying vec3 vW; varying vec3 vN;
void main(){
  vUv=uv; vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz;
  vN=normalize(mat3(modelMatrix)*normal);
  gl_Position=projectionMatrix*viewMatrix*wp;
}`;
const PLANET_FRAG=`
uniform sampler2D uMap; uniform sampler2D uNight; uniform sampler2D uRing;
uniform vec3 uSunPos; uniform vec3 uCenter; uniform float uRadius;
uniform vec3 uAtmoColor; uniform float uAtmo; uniform float uAmbient; uniform float uNightAmt; uniform float uSpec;
uniform vec3 uRingN; uniform vec2 uRingR; uniform float uRingOn;
varying vec2 vUv; varying vec3 vW; varying vec3 vN;
void main(){
  vec3 N=normalize(vN); vec3 L=normalize(uSunPos-vW); vec3 V=normalize(cameraPosition-vW);
  float ndl=dot(N,L);
  vec3 alb=texture2D(uMap,vUv).rgb;
  float lit=smoothstep(-0.05,0.42,ndl);
  if(uRingOn>0.5){
    float dl=dot(L,uRingN);
    if(abs(dl)>0.02){
      float t=dot(uCenter-vW,uRingN)/dl;
      if(t>0.0){
        vec3 Q=vW+L*t; float r=length(Q-uCenter)/uRadius;
        if(r>uRingR.x&&r<uRingR.y){
          float a=texture2D(uRing,vec2((r-uRingR.x)/(uRingR.y-uRingR.x),0.5)).a;
          lit*=1.0-a*0.9;
        }
      }
    }
  }
  vec3 col=alb*(uAmbient+0.96*lit);
  if(uSpec>0.0){
    float oc=smoothstep(0.08,0.18,alb.b-alb.r);
    vec3 H=normalize(L+V);
    col+=vec3(1.0,0.95,0.85)*pow(max(dot(N,H),0.0),90.0)*oc*uSpec*lit;
  }
  if(uNightAmt>0.0){
    vec3 nl=texture2D(uNight,vUv).rgb;
    col+=nl*(1.0-smoothstep(-0.14,0.10,ndl))*uNightAmt;
  }
  float fr=pow(1.0-clamp(dot(N,V),0.0,1.0),3.0);
  col+=uAtmoColor*fr*uAtmo*(0.2+0.8*smoothstep(-0.3,0.5,ndl));
  gl_FragColor=vec4(col,1.0);
}`;
const CLOUD_FRAG=`
uniform sampler2D uMap; uniform vec3 uSunPos; uniform float uAmbient;
varying vec2 vUv; varying vec3 vW; varying vec3 vN;
void main(){
  vec3 N=normalize(vN); vec3 L=normalize(uSunPos-vW);
  float lit=smoothstep(-0.05,0.45,dot(N,L));
  float c=texture2D(uMap,vUv).r;
  gl_FragColor=vec4(vec3(1.0)*(uAmbient+0.95*lit),c*0.85);
}`;
const ATMO_FRAG=`
uniform vec3 uColor; uniform vec3 uCenter; uniform vec3 uSunPos; uniform float uIntensity; uniform float uInner;
varying vec3 vW; varying vec3 vN;
void main(){
  vec3 N=normalize(vN); vec3 V=normalize(cameraPosition-vW); vec3 L=normalize(uSunPos-vW);
  float k=-dot(N,V);
  float k0=sqrt(max(1.0-uInner*uInner,0.01));
  float a=pow(smoothstep(0.0,k0,k),1.6);
  float sun=0.3+0.7*smoothstep(-0.25,0.5,dot(normalize(vW-uCenter),L));
  gl_FragColor=vec4(uColor*a*sun*uIntensity,1.0);
}`;
const RING_FRAG=`
uniform sampler2D uRing; uniform vec3 uSunPos; uniform vec3 uCenter; uniform vec3 uRingN; uniform float uRadius;
varying vec2 vUv; varying vec3 vW; varying vec3 vN;
void main(){
  vec4 t=texture2D(uRing,vec2(vUv.x,0.5));
  if(t.a<0.01) discard;
  vec3 L=normalize(uSunPos-vW); vec3 V=normalize(cameraPosition-vW);
  float side=dot(uRingN,L)*dot(uRingN,V);
  float lit=mix(0.28,1.0,smoothstep(-0.12,0.12,side));
  vec3 oc=uCenter-vW; float b=dot(oc,L); float sh=1.0;
  if(b>0.0){ float d2=dot(oc,oc)-b*b; sh=smoothstep(uRadius*uRadius*0.97,uRadius*uRadius*1.03,d2); }
  vec3 col=t.rgb*(0.05+1.05*lit*sh);
  gl_FragColor=vec4(col,t.a);
}`;
const SUN_FRAG=`
uniform sampler2D uMap; uniform float uTime; uniform float uBright;
varying vec2 vUv; varying vec3 vW; varying vec3 vN;
void main(){
  vec3 N=normalize(vN); vec3 V=normalize(cameraPosition-vW);
  vec3 a=texture2D(uMap,vUv+vec2(uTime*0.004,0.0)).rgb;
  vec3 b=texture2D(uMap,vUv*vec2(1.7,1.4)+vec2(-uTime*0.003,uTime*0.0015)).rgb;
  vec3 c=mix(a,b,0.45)*1.18;
  float fr=1.0-clamp(dot(N,V),0.0,1.0);
  c*=mix(1.0,0.52,pow(fr,1.5));
  c=mix(c,vec3(1.0,0.5,0.12),pow(fr,3.0)*0.4);
  gl_FragColor=vec4(c*uBright,1.0);
}`;
const ROCK_VERT=`
varying vec3 vW; varying float vT;
void main(){
  mat4 im=mat4(1.0);
  #ifdef USE_INSTANCING
    im=instanceMatrix;
  #endif
  vec4 wp=modelMatrix*im*vec4(position,1.0);
  vW=wp.xyz;
  vT=fract(sin(dot(im[3].xyz,vec3(12.9898,78.233,37.719)))*43758.5453);
  gl_Position=projectionMatrix*viewMatrix*wp;
}`;
const ROCK_FRAG=`
uniform vec3 uSunPos;
varying vec3 vW; varying float vT;
void main(){
  vec3 fn=normalize(cross(dFdx(vW),dFdy(vW)));
  if(dot(fn,cameraPosition-vW)<0.0) fn=-fn;
  vec3 L=normalize(uSunPos-vW);
  float d=max(dot(fn,L),0.0);
  vec3 base=mix(vec3(0.26,0.23,0.21),vec3(0.58,0.52,0.45),vT);
  gl_FragColor=vec4(base*(0.045+1.15*d),1.0);
}`;
const STREAK_VERT=`
varying vec2 vUv;
void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const STREAK_FRAG=`
uniform vec3 uColor; uniform float uAlpha;
varying vec2 vUv;
void main(){
  float x=vUv.x; float y=vUv.y-0.5;
  float tail=pow(x,2.2);
  float core=exp(-pow(y*9.0,2.0));
  float glow=exp(-pow(y*3.5,2.0))*0.35;
  float head=smoothstep(0.88,1.0,x)*exp(-pow(y*5.0,2.0))*1.7;
  float a=(core*tail+glow*tail*0.5+head)*uAlpha;
  vec3 c=mix(uColor,vec3(1.0),core*smoothstep(0.55,1.0,x));
  gl_FragColor=vec4(c*a,a);
}`;
const TAIL_VERT=`
attribute float aT; attribute vec3 aSeed;
uniform float uTime; uniform float uLen; uniform float uSpread; uniform vec3 uCurve; uniform float uSize; uniform float uScale;
varying float vT; varying float vFlick;
void main(){
  float t=aT;
  vec3 p=vec3(0.0,0.0,t*uLen);
  float sp=uSpread*t*(0.12+t);
  p.xy+=(aSeed.xy-0.5)*2.0*sp*(1.0+0.35*sin(uTime*1.7+aSeed.z*30.0+t*8.0));
  p+=uCurve*t*t;
  vT=t; vFlick=0.75+0.25*sin(uTime*3.0+aSeed.z*50.0);
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  gl_PointSize=uSize*uScale*mix(1.0,0.35,t)*vFlick*(300.0/max(-mv.z,20.0));
  gl_Position=projectionMatrix*mv;
}`;
const TAIL_FRAG=`
uniform vec3 uColorA; uniform vec3 uColorB; uniform float uAlpha;
varying float vT; varying float vFlick;
void main(){
  float d=length(gl_PointCoord-0.5);
  if(d>0.5) discard;
  float a=smoothstep(0.5,0.0,d); a*=a;
  vec3 c=mix(uColorA,uColorB,vT);
  gl_FragColor=vec4(c*a*pow(1.0-vT,1.5)*uAlpha*vFlick,1.0);
}`;

/* ─────────────────────────────────────────────────────────────────────────
   5. LAYOUT (az/el are degrees from straight ahead; distances in scene units)
   ───────────────────────────────────────────────────────────────────────── */
const SUN={az:215,el:8,d:400,r:30};
const PLANETS=[
 {id:"mercury",type:0,az:240,el:6, d:150,r:3.2,tilt:1,   spin:.012, size:[1024,512], seed:2, A:[.30,.28,.26],B:[.62,.58,.54], atmo:null},
 {id:"venus",  type:2,az:180,el:14,d:170,r:7,  tilt:177, spin:-.005,size:[1024,512], seed:1, A:[.78,.64,.38],B:[.97,.91,.70],C:[1,0,0], atmo:{c:[1,.82,.45],i:.95,h:1.07}},
 {id:"earth",  type:3,az:95, el:10,d:140,r:8.5,tilt:23.4,spin:.02,  size:[2048,1024],night:true,clouds:true,spec:.55,atmo:{c:[.32,.58,1],i:1.1,h:1.07},
   moons:[{id:"moon",type:1,r:2.3,orbit:19,speed:.05,incl:5,size:[1024,512],seed:4,A:[.30,.30,.31],B:[.70,.69,.67]}]},
 {id:"mars",   type:6,az:40, el:-4,d:190,r:5.2,tilt:25.2,spin:.02,  size:[1024,512], seed:3, A:[.52,.25,.14],B:[.80,.52,.31],C:[.24,.14,.10], atmo:{c:[.95,.6,.4],i:.35,h:1.04}},
 {id:"jupiter",type:7,az:330,el:14,d:330,r:52, tilt:3.1, spin:.04,  size:[2048,1024],seed:5, atmo:{c:[.85,.7,.55],i:.35,h:1.03},
   moons:[
    {id:"io",      type:12,r:2.8,orbit:68, speed:.10, incl:1,size:[512,256],seed:1,A:[.88,.78,.30],B:[.96,.9,.55]},
    {id:"europa",  type:13,r:2.5,orbit:84, speed:.07, incl:2,size:[512,256],seed:2,A:[.86,.83,.76],B:[.96,.94,.9]},
    {id:"ganymede",type:1, r:4.2,orbit:104,speed:.045,incl:2,size:[512,256],seed:6,A:[.28,.24,.20],B:[.60,.55,.50]},
    {id:"callisto",type:1, r:3.8,orbit:126,speed:.03, incl:3,size:[512,256],seed:9,A:[.20,.18,.16],B:[.40,.37,.33]}]},
 {id:"saturn", type:8,az:150,el:22,d:385,r:38, tilt:26.7,spin:.035, size:[1024,512], seed:7, A:[.70,.60,.42],B:[.88,.78,.57],C:[.50,.48,.46], atmo:{c:[.95,.85,.6],i:.3,h:1.03},
   ring:{inner:1.24,outer:2.35,kind:"saturn"},
   moons:[{id:"titan",type:2,r:3.6,orbit:112,speed:.04,incl:1,size:[512,256],seed:3,A:[.78,.50,.18],B:[.92,.68,.32],C:[.35,0,0]}]},
 {id:"uranus", type:9,az:5,  el:28,d:405,r:20, tilt:97.8,spin:.02,  size:[512,256],  seed:1, A:[.40,.68,.74],B:[.56,.80,.85], atmo:{c:[.6,.9,.95],i:.5,h:1.05},
   ring:{inner:1.65,outer:2.05,kind:"uranus"}},
 {id:"neptune",type:10,az:275,el:20,d:415,r:19, tilt:28.3,spin:.025, size:[1024,512], seed:3, A:[.10,.24,.74],B:[.24,.42,.90],C:[.04,.08,.32], atmo:{c:[.3,.5,1],i:.65,h:1.05}}
];
const GALAXIES=[{az:60,el:48,d:430,s:120,seed:.31,tiltX:1.0,tiltZ:.4},{az:250,el:-34,d:430,s:90,seed:.77,tiltX:1.2,tiltZ:-.5}];

function dirFromAzEl(az,el,d,out){
  const a=az*Math.PI/180,e=el*Math.PI/180;
  out.set(d*Math.cos(e)*Math.sin(a),d*Math.sin(e),-d*Math.cos(e)*Math.cos(a));return out;
}

function ringData(kind){
  const w=1024,data=new Uint8Array(w*4);
  const sm=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
  const rnd=i=>{const s=Math.sin(i*127.1+311.7)*43758.5453;return s-Math.floor(s)};
  const vn=x=>{const i=Math.floor(x),f=x-i,u=f*f*(3-2*f);return rnd(i)*(1-u)+rnd(i+1)*u};
  for(let i=0;i<w;i++){
    const t=i/(w-1);let dens=0,r=.86,g=.78,b=.64;
    if(kind==="saturn"){
      const C=sm(.0,.05,t)*(1-sm(.2,.24,t))*.28;                         // faint C ring
      const B=sm(.2,.26,t)*(1-sm(.52,.56,t))*(.8+.2*vn(t*60));          // bright B ring
      const A=sm(.62,.66,t)*(1-sm(.93,.96,t))*(.62+.2*vn(t*50))*(1-.8*sm(.84,.845,t)*(1-sm(.855,.86,t))); // A ring + Encke gap
      dens=Math.max(C,B,A);
      dens*=.7+.3*vn(t*260+5)+.12*(vn(t*900)-.5);
      const tone=vn(t*30+9);r=.84+.1*tone;g=.74+.09*tone;b=.58+.08*tone;
      if(t<.24){r*=.75;g*=.75;b*=.78}
    }else{
      dens=0;[.12,.2,.3,.4,.5,.62,.74,.86].forEach(c=>{dens=Math.max(dens,Math.exp(-Math.pow((t-c)*60,2))*.32)});
      r=.30;g=.32;b=.36;
    }
    const k=i*4;data[k]=Math.min(255,r*255);data[k+1]=Math.min(255,g*255);data[k+2]=Math.min(255,b*255);data[k+3]=Math.max(0,Math.min(255,dens*255));
  }
  return data;
}

// exposed for tests
window.CosmosSolarLib={BAKE_FRAG,BAKE_VERT,createBaker,makeEarthMask,ringData,PLANETS,SUN,
  shaders:{PLANET_VERT,PLANET_FRAG,CLOUD_FRAG,ATMO_FRAG,RING_FRAG,SUN_FRAG,ROCK_VERT,ROCK_FRAG,STREAK_VERT,STREAK_FRAG,TAIL_VERT,TAIL_FRAG}};

if(!window.AFRAME||!window.CosmosShared)return;   // loaded outside the page (tests)
const THREE=AFRAME.THREE;
const C=window.CosmosShared.C;

/* ─────────────────────────────────────────────────────────────────────────
   6. HELPERS
   ───────────────────────────────────────────────────────────────────────── */
function canvasTex(cv,opts){
  const t=new THREE.CanvasTexture(cv);
  t.wrapS=THREE.RepeatWrapping;t.anisotropy=(opts&&opts.aniso)||4;t.needsUpdate=true;return t;
}
function glowTexture(stops,size){
  const c=document.createElement("canvas");c.width=c.height=size||128;const x=c.getContext("2d");
  const g=x.createRadialGradient(c.width/2,c.height/2,0,c.width/2,c.height/2,c.width/2);
  stops.forEach(s=>g.addColorStop(s[0],s[1]));x.fillStyle=g;x.fillRect(0,0,c.width,c.height);
  const t=new THREE.CanvasTexture(c);return t;
}
function glareTexture(){
  const s=256,c=document.createElement("canvas");c.width=c.height=s;const x=c.getContext("2d");
  x.translate(s/2,s/2);x.globalCompositeOperation="lighter";
  for(let i=0;i<3;i++){
    x.save();x.rotate(i*Math.PI/3+.15);
    const g=x.createLinearGradient(-s/2,0,s/2,0);
    g.addColorStop(0,"rgba(255,230,180,0)");g.addColorStop(.5,"rgba(255,240,210,.55)");g.addColorStop(1,"rgba(255,230,180,0)");
    x.fillStyle=g;x.fillRect(-s/2,-1.6,s,3.2);x.restore();
  }
  const r=x.createRadialGradient(0,0,0,0,0,s/2);r.addColorStop(0,"rgba(255,235,200,.5)");r.addColorStop(1,"rgba(255,200,120,0)");
  x.fillStyle=r;x.fillRect(-s/2,-s/2,s,s);
  return new THREE.CanvasTexture(c);
}
function ringTexture(kind){
  const data=ringData(kind),tex=new THREE.DataTexture(data,1024,1,THREE.RGBAFormat);
  tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearFilter;tex.generateMipmaps=false;tex.needsUpdate=true;return tex;
}
function ringGeometry(inner,outer,seg){
  const pos=[],uv=[],idx=[];
  for(let i=0;i<=seg;i++){
    const a=i/seg*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
    pos.push(c*inner,0,s*inner,c*outer,0,s*outer);uv.push(0,i/seg,1,i/seg);
    if(i<seg){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2)}
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute("normal",new THREE.Float32BufferAttribute(new Array(pos.length/3).fill(0).flatMap(()=>[0,1,0]),3));
  g.setIndex(idx);return g;
}

/* ─────────────────────────────────────────────────────────────────────────
   7. COMPONENT
   ───────────────────────────────────────────────────────────────────────── */
AFRAME.registerComponent("cosmos-solar",{
  init(){
    const quest=/OculusBrowser|Quest/i.test(navigator.userAgent);
    const mobile=/Android|iPhone|iPad/i.test(navigator.userAgent);
    this.lowEnd=quest||mobile;
    this.root=new THREE.Group();this.el.setObject3D("mesh",this.root);
    this.sunPos=new THREE.Vector3();dirFromAzEl(SUN.az,SUN.el,SUN.d,this.sunPos);
    this.shared={uSunPos:{value:this.sunPos}};
    this.bodies=[];this.moons=[];this.t=0;
    this._v=new THREE.Vector3();this._cam=new THREE.Vector3();
    this.comets=[];this.streaks=[];this.nextComet=5;this.nextBolide=35;
    this.buildStreaks();this.buildComets();
    let baker=null;
    try{baker=createBaker()}catch(e){console.warn("planet baking unavailable:",e)}
    this.baker=baker;
    if(baker){
      this.buildSun();
      PLANETS.forEach(p=>this.buildPlanet(p));
      this.buildAsteroids();
      GALAXIES.forEach(g=>this.buildGalaxy(g));
      this.queue=this.makeQueue();
      this.pump();
    }
  },

  /* texture baking, one job per timer tick so loading never freezes the page */
  makeQueue(){
    const q=[];
    this.jobs.forEach(j=>q.push(j));
    return q;
  },
  pump(){
    if(!this.queue.length){if(this.baker){this.baker.dispose();this.baker=null}return}
    const job=this.queue.shift();
    try{job()}catch(e){console.warn("bake job failed",e)}
    setTimeout(()=>this.pump(),24);
  },
  scaleSize(s){return this.lowEnd?[Math.max(256,s[0]>>1),Math.max(128,s[1]>>1)]:s},
  bake(type,size,o){const s=this.scaleSize(size);return this.baker.bake(type,s[0],s[1],o)},

  planetMaterial(frag,uniforms,extra){
    return new THREE.ShaderMaterial(Object.assign({
      uniforms:Object.assign({uSunPos:this.shared.uSunPos},uniforms),
      vertexShader:PLANET_VERT,fragmentShader:frag
    },extra||{}));
  },

  buildSun(){
    this.jobs=this.jobs||[];
    const g=new THREE.Group();dirFromAzEl(SUN.az,SUN.el,SUN.d,g.position);this.root.add(g);
    const mat=new THREE.ShaderMaterial({uniforms:{uMap:{value:null},uTime:{value:0},uBright:{value:1}},vertexShader:PLANET_VERT,fragmentShader:SUN_FRAG});
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,64,48),mat);mesh.scale.setScalar(SUN.r);mesh.visible=false;g.add(mesh);
    const corona=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture([[0,"rgba(255,235,190,.95)"],[.16,"rgba(255,190,100,.55)"],[.4,"rgba(255,130,40,.16)"],[1,"rgba(255,90,20,0)"]],256),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,fog:false}));
    corona.scale.setScalar(SUN.r*9);corona.visible=false;g.add(corona);
    const glare=new THREE.Sprite(new THREE.SpriteMaterial({map:glareTexture(),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:.55,fog:false}));
    glare.scale.setScalar(SUN.r*17);glare.visible=false;g.add(glare);
    this.sun={group:g,mesh,mat,corona,glare,ready:0};
    this.jobs.push(()=>{mat.uniforms.uMap.value=canvasTex(this.bake(11,[1024,512],{seed:1}));mesh.visible=corona.visible=glare.visible=true;this.sun.ready=.001});
  },

  buildPlanet(p){
    this.jobs=this.jobs||[];
    const tilt=new THREE.Group();dirFromAzEl(p.az,p.el,p.d,tilt.position);
    tilt.rotation.z=p.tilt*Math.PI/180;tilt.rotation.y=(p.az*.37)*Math.PI/180;
    this.root.add(tilt);
    tilt.scale.setScalar(.0001);tilt.visible=false;
    const center=new THREE.Vector3();
    const u={uMap:{value:null},uNight:{value:null},uRing:{value:null},uCenter:{value:center},uRadius:{value:p.r},
      uAtmoColor:{value:new THREE.Color().fromArray(p.atmo?p.atmo.c:[0,0,0])},uAtmo:{value:p.atmo?p.atmo.i:0},
      uAmbient:{value:.05},uNightAmt:{value:p.night?1:0},uSpec:{value:p.spec||0},
      uRingN:{value:new THREE.Vector3(0,1,0)},uRingR:{value:new THREE.Vector2(p.ring?p.ring.inner:0,p.ring?p.ring.outer:0)},uRingOn:{value:p.ring?1:0}};
    const mat=this.planetMaterial(PLANET_FRAG,u);
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(p.r,64,48),mat);
    // the shader works in world units, so the mesh carries its own radius (scale stays 1 for correct normals)
    tilt.add(mesh);
    const body={p,tilt,mesh,mat,center,spin:p.spin,uni:u,clouds:null,atmo:null,ring:null,ready:0};
    this.bodies.push(body);

    if(p.atmo){
      const am=this.planetMaterial(ATMO_FRAG,{uColor:{value:new THREE.Color().fromArray(p.atmo.c)},uCenter:{value:center},uIntensity:{value:p.atmo.i},uInner:{value:1/p.atmo.h}},
        {side:THREE.BackSide,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
      const a=new THREE.Mesh(new THREE.SphereGeometry(p.r*p.atmo.h,48,32),am);a.renderOrder=2;tilt.add(a);body.atmo={mesh:a,mat:am};
    }
    if(p.clouds){
      const cm=this.planetMaterial(CLOUD_FRAG,{uMap:{value:null},uAmbient:{value:.04}},{transparent:true,depthWrite:false});
      const cl=new THREE.Mesh(new THREE.SphereGeometry(p.r*1.012,64,48),cm);cl.renderOrder=1;tilt.add(cl);body.clouds={mesh:cl,mat:cm};
    }
    if(p.ring){
      const rm=this.planetMaterial(RING_FRAG,{uRing:{value:ringTexture(p.ring.kind)},uCenter:{value:center},uRingN:{value:u.uRingN.value},uRadius:{value:p.r}},
        {side:THREE.DoubleSide,transparent:true,depthWrite:false});
      const rg=new THREE.Mesh(ringGeometry(p.r*p.ring.inner,p.r*p.ring.outer,160),rm);rg.renderOrder=1;tilt.add(rg);
      body.ring={mesh:rg,mat:rm};u.uRing.value=rm.uniforms.uRing.value;
    }
    this.jobs.push(()=>{
      const o={seed:p.seed,A:p.A,B:p.B,C:p.C};
      if(p.type===3){
        const mask=makeEarthMask(2048,1024);o.mask=mask;
        u.uMap.value=canvasTex(this.bake(3,p.size,o));
        u.uNight.value=canvasTex(this.bake(4,[1024,512],o));
        body.clouds.mat.uniforms.uMap.value=canvasTex(this.bake(5,[1024,512],{seed:2}));
      }else u.uMap.value=canvasTex(this.bake(p.type,p.size,o));
      tilt.visible=true;body.ready=.001;
    });
    (p.moons||[]).forEach(m=>this.buildMoon(body,m));
  },

  buildMoon(parent,m){
    const mc=new THREE.Vector3();
    const u={uMap:{value:null},uNight:{value:null},uRing:{value:null},uCenter:{value:mc},uRadius:{value:m.r},uAtmoColor:{value:new THREE.Color(0,0,0)},uAtmo:{value:0},uAmbient:{value:.04},uNightAmt:{value:0},uSpec:{value:0},uRingN:{value:new THREE.Vector3(0,1,0)},uRingR:{value:new THREE.Vector2()},uRingOn:{value:0}};
    const mat=this.planetMaterial(PLANET_FRAG,u);
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(m.r,40,28),mat);mesh.visible=false;
    parent.tilt.add(mesh);
    const moon={m,mesh,center:mc,angle:Math.random()*6.28,uni:u};
    this.moons.push(moon);
    this.jobs.push(()=>{u.uMap.value=canvasTex(this.bake(m.type,m.size,{seed:m.seed,A:m.A,B:m.B,C:m.C}));mesh.visible=true});
  },

  buildGalaxy(g){
    const mat=new THREE.MeshBasicMaterial({transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,fog:false,opacity:.0,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),mat);
    dirFromAzEl(g.az,g.el,g.d,mesh.position);mesh.scale.set(g.s,g.s,1);mesh.lookAt(0,0,0);mesh.rotateX(g.tiltX*.6);mesh.rotateZ(g.tiltZ);
    mesh.renderOrder=-6;mesh.visible=false;this.root.add(mesh);
    this.jobs.push(()=>{mat.map=canvasTex(this.bake(20,[512,512],{seed:g.seed}));mat.needsUpdate=true;mat.opacity=.85;mesh.visible=true});
  },

  buildAsteroids(){
    const N=this.lowEnd?90:150;
    const geo=new THREE.IcosahedronGeometry(1,1);const p=geo.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const h=1+.34*(Math.sin(x*3.1+y*2.3)*Math.cos(z*2.7+x*1.9)+.5*Math.sin(y*6.1+z*5.3));
      p.setXYZ(i,x*h,y*h*.85,z*h*1.05);
    }
    const mat=new THREE.ShaderMaterial({uniforms:{uSunPos:this.shared.uSunPos},vertexShader:ROCK_VERT,fragmentShader:ROCK_FRAG,extensions:{derivatives:true}});
    const mesh=new THREE.InstancedMesh(geo,mat,N);mesh.frustumCulled=false;this.root.add(mesh);
    this.rocks={mesh,N,data:[]};
    for(let i=0;i<N;i++){
      const r=34+Math.random()*95,a=Math.random()*6.283,y=(Math.random()-.5)*60;
      this.rocks.data.push({pos:new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r),axis:new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize(),
        ang:Math.random()*6.28,spd:(Math.random()-.5)*.5,s:.35*Math.pow(10,Math.random()*.95)*(r>90?1.6:1),sq:new THREE.Vector3(.7+Math.random()*.6,.7+Math.random()*.6,.7+Math.random()*.6)});
    }
    this._m=new THREE.Matrix4();this._q=new THREE.Quaternion();this._sc=new THREE.Vector3();
    this.updateRocks(0);
  },
  updateRocks(dt){
    const R=this.rocks;if(!R)return;
    R.mesh.rotation.y+=dt*.004;
    for(let i=0;i<R.N;i++){
      const d=R.data[i];d.ang+=d.spd*dt;
      this._q.setFromAxisAngle(d.axis,d.ang);
      this._sc.set(d.s*d.sq.x,d.s*d.sq.y,d.s*d.sq.z);
      this._m.compose(d.pos,this._q,this._sc);R.mesh.setMatrixAt(i,this._m);
    }
    R.mesh.instanceMatrix.needsUpdate=true;
  },

  /* ── shooting stars ── */
  buildStreaks(){
    const geo=new THREE.PlaneGeometry(1,1);
    for(let i=0;i<10;i++){
      const mat=new THREE.ShaderMaterial({uniforms:{uColor:{value:new THREE.Color(1,1,1)},uAlpha:{value:0}},vertexShader:STREAK_VERT,fragmentShader:STREAK_FRAG,
        transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(geo,mat);mesh.visible=false;mesh.frustumCulled=false;mesh.renderOrder=-3;this.root.add(mesh);
      this.streaks.push({mesh,mat,live:false,t:0,life:1,vel:new THREE.Vector3(),len:10,peak:1});
    }
    this._X=new THREE.Vector3();this._Y=new THREE.Vector3();this._Z=new THREE.Vector3();this._B=new THREE.Matrix4();
  },
  spawnStreak(big){
    const s=this.streaks.find(x=>!x.live);if(!s)return;
    const rig=C.rigEl?C.rigEl.object3D.position:this._v.set(0,0,0);
    const az=Math.random()*6.283,el=(Math.random()*70-5)*Math.PI/180,R=(big?110:70)+Math.random()*60;
    s.mesh.position.set(rig.x+R*Math.cos(el)*Math.cos(az),rig.y+R*Math.sin(el),rig.z+R*Math.cos(el)*Math.sin(az));
    // mostly falling, sometimes sideways
    const ang=-Math.PI/2+(Math.random()-.5)*2.2,tx=Math.cos(az+Math.PI/2),tz=Math.sin(az+Math.PI/2);
    s.vel.set(tx*Math.cos(ang),Math.sin(ang),tz*Math.cos(ang)).normalize().multiplyScalar(big?55+Math.random()*25:90+Math.random()*70);
    const sc=this.el.sceneEl.camera;if(sc)sc.getWorldPosition(this._cam);else this._cam.set(0,1.6,0);
    this._X.copy(s.vel).normalize();
    this._Z.copy(this._cam).sub(s.mesh.position).normalize();this._Z.addScaledVector(this._X,-this._Z.dot(this._X)).normalize();
    this._Y.crossVectors(this._Z,this._X);
    this._B.makeBasis(this._X,this._Y,this._Z);s.mesh.quaternion.setFromRotationMatrix(this._B);
    s.len=big?46:(10+Math.random()*20);const wid=big?3.2:(.55+Math.random()*.5);
    s.mesh.scale.set(s.len,wid,1);
    const pick=Math.random();
    s.mat.uniforms.uColor.value.set(big?"#7dffb0":(pick<.55?"#cfe3ff":pick<.85?"#ffe2b0":"#ffb7e6"));
    s.life=big?1.7+Math.random()*.6:.55+Math.random()*.6;s.t=0;s.peak=big?1.7:1;s.live=true;s.mesh.visible=true;
  },

  /* ── comets ── */
  buildComets(){
    const glow=glowTexture([[0,"rgba(220,240,255,1)"],[.25,"rgba(150,200,255,.55)"],[1,"rgba(80,140,255,0)"]],128);
    const mkTail=(count,colA,colB,len,spread,size,curve)=>{
      const pos=new Float32Array(count*3),t=new Float32Array(count),seed=new Float32Array(count*3);
      for(let i=0;i<count;i++){t[i]=Math.pow(Math.random(),1.5);seed[i*3]=Math.random();seed[i*3+1]=Math.random();seed[i*3+2]=Math.random()}
      const g=new THREE.BufferGeometry();
      g.setAttribute("position",new THREE.BufferAttribute(pos,3));g.setAttribute("aT",new THREE.BufferAttribute(t,1));g.setAttribute("aSeed",new THREE.BufferAttribute(seed,3));
      const m=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uLen:{value:len},uSpread:{value:spread},uCurve:{value:curve},uSize:{value:size},uScale:{value:1.2},uColorA:{value:new THREE.Color(colA)},uColorB:{value:new THREE.Color(colB)},uAlpha:{value:0}},
        vertexShader:TAIL_VERT,fragmentShader:TAIL_FRAG,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
      const pts=new THREE.Points(g,m);pts.frustumCulled=false;return pts;
    };
    for(let i=0;i<2;i++){
      const group=new THREE.Group();group.visible=false;this.root.add(group);
      const nucleus=new THREE.Mesh(new THREE.SphereGeometry(.9,12,10),new THREE.MeshBasicMaterial({color:"#ddd2c4"}));group.add(nucleus);
      const coma=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:0}));coma.scale.setScalar(16);group.add(coma);
      const curve=new THREE.Vector3();
      const ion=mkTail(280,"#e8f4ff","#3c78ff",150,5,13,new THREE.Vector3());
      const dust=mkTail(380,"#fff0cf","#ff8a3c",110,22,22,curve);
      group.add(ion,dust);
      this.comets.push({group,nucleus,coma,ion,dust,curve,live:false,t:0,life:60,vel:new THREE.Vector3()});
    }
    this._q2=new THREE.Quaternion();this._away=new THREE.Vector3();this._vl=new THREE.Vector3();this._zA=new THREE.Vector3(0,0,1);
  },
  spawnComet(first){
    const c=this.comets.find(x=>!x.live);if(!c)return;
    const az=first?(300+Math.random()*30):Math.random()*360,el=10+Math.random()*40;
    const A=dirFromAzEl(az,el,300,new THREE.Vector3());
    const rig=C.rigEl?C.rigEl.object3D.position:new THREE.Vector3();
    const side=(Math.random()<.5?-1:1)*(60+Math.random()*80);
    const B=new THREE.Vector3(rig.x+side*Math.cos(az*Math.PI/180),rig.y+10+Math.random()*50,rig.z+side*Math.sin(az*Math.PI/180));
    c.vel.copy(B).sub(A).normalize().multiplyScalar(9+Math.random()*5);
    c.group.position.copy(A);c.life=2*300/c.vel.length()*.8;c.t=0;c.live=true;c.group.visible=true;
  },
  updateComets(dt,t){
    this.nextComet-=dt;if(this.nextComet<=0&&this.comets.some(c=>!c.live)){this.spawnComet(!this._firstDone);this._firstDone=true;this.nextComet=45+Math.random()*50}
    for(const c of this.comets){
      if(!c.live)continue;
      c.t+=dt;if(c.t>=c.life){c.live=false;c.group.visible=false;continue}
      c.group.position.addScaledVector(c.vel,dt);
      // tails always point away from the Sun
      this._away.copy(c.group.position).sub(this.sunPos).normalize();
      c.group.quaternion.setFromUnitVectors(this._zA,this._away);
      // dust tail bends back along the orbit
      this._q2.copy(c.group.quaternion).invert();this._vl.copy(c.vel).normalize().applyQuaternion(this._q2);
      c.curve.set(-this._vl.x*38,-this._vl.y*38,0);
      const env=Math.min(1,c.t/6,(c.life-c.t)/6),en=.85+.5*C.energy;
      c.ion.material.uniforms.uTime.value=c.dust.material.uniforms.uTime.value=t;
      c.ion.material.uniforms.uAlpha.value=.95*env*en;c.dust.material.uniforms.uAlpha.value=.8*env*en;
      c.coma.material.opacity=.9*env;c.nucleus.visible=env>.02;
    }
  },

  /* ── frame ── */
  tick(time,dtMs){
    const dt=Math.min(.05,dtMs/1000),t=time/1000;this.t=t;
    // bodies
    for(const b of this.bodies){
      if(b.tilt.visible&&b.ready>0&&b.ready<1){b.ready=Math.min(1,b.ready+dt*.6);const k=b.ready*b.ready*(3-2*b.ready);b.tilt.scale.setScalar(Math.max(.0001,k))}
      if(!b.tilt.visible)continue;
      b.mesh.rotation.y+=b.spin*dt;
      if(b.clouds)b.clouds.mesh.rotation.y+=b.spin*dt*1.25;
      b.tilt.getWorldPosition(b.center);
      if(b.ring)b.uni.uRingN.value.set(0,1,0).transformDirection(b.tilt.matrixWorld);
      if(b.atmo)b.atmo.mat.uniforms.uIntensity.value=b.p.atmo.i*(1+.12*C.energy+.15*C.beat);
    }
    for(const m of this.moons){
      if(!m.mesh.visible)continue;
      m.angle+=m.m.speed*dt;const inc=m.m.incl*Math.PI/180;
      m.mesh.position.set(Math.cos(m.angle)*m.m.orbit,Math.sin(m.angle)*m.m.orbit*Math.sin(inc),Math.sin(m.angle)*m.m.orbit*Math.cos(inc));
      m.mesh.getWorldPosition(m.center);
    }
    if(this.sun&&this.sun.ready){
      const s=this.sun;
      if(s.ready<1){s.ready=Math.min(1,s.ready+dt*.5)}
      s.mat.uniforms.uTime.value=t;s.mat.uniforms.uBright.value=1.08+.12*C.energy+.1*C.beat;
      s.mesh.scale.setScalar(SUN.r*Math.max(.02,s.ready*s.ready*(3-2*s.ready)));
      const pulse=1+.05*C.energy+.04*C.beat;
      s.corona.scale.setScalar(SUN.r*9*pulse*s.ready);s.glare.scale.setScalar(SUN.r*17*s.ready*(1+.1*C.energy));
      s.glare.material.rotation=t*.02;
      s.corona.material.color.copy(C.tint).lerp(this._white||(this._white=new THREE.Color(1,1,1)),.8);
    }
    this.updateRocks(dt);
    this.updateComets(dt,t);
    // shooting stars: ambient + extra on beats, rare bolides
    {
      const rate=C.playing?(.35+C.mood.meteor*.5):.12;
      if(Math.random()<rate*dt)this.spawnStreak(false);
      if(C.beat>.95&&Math.random()<.3)this.spawnStreak(false);
    }
    this.nextBolide-=dt;if(this.nextBolide<=0){this.spawnStreak(true);this.nextBolide=35+Math.random()*45}
    for(const s of this.streaks){
      if(!s.live)continue;
      s.t+=dt;const k=s.t/s.life;if(k>=1){s.live=false;s.mesh.visible=false;continue}
      s.mesh.position.addScaledVector(s.vel,dt);
      s.mat.uniforms.uAlpha.value=Math.sin(Math.PI*Math.min(1,k*1.15))*s.peak;
    }
    // tails look right at VR resolution
    const sc=C.inVR?1.7:Math.min(2,window.devicePixelRatio||1);
    for(const c of this.comets){c.ion.material.uniforms.uScale.value=sc;c.dust.material.uniforms.uScale.value=sc}
  }
});
})();
