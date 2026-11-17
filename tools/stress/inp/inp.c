#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>
#include <wayland-client.h>
#include <time.h>
#include "fi.h"
static struct org_kde_kwin_fake_input *fi;
static void reg(void *d, struct wl_registry *r, uint32_t n, const char *i, uint32_t v){
  if(!strcmp(i,"org_kde_kwin_fake_input")) fi=wl_registry_bind(r,n,&org_kde_kwin_fake_input_interface, v<6?v:6);
}
static void rem(void*d,struct wl_registry*r,uint32_t n){}
static const struct wl_registry_listener rl={reg,rem};
int main(){
  struct wl_display *d=wl_display_connect(NULL); if(!d){perror("connect");return 1;}
  struct wl_registry *r=wl_display_get_registry(d); wl_registry_add_listener(r,&rl,NULL);
  wl_display_roundtrip(d); if(!fi){fprintf(stderr,"no fake_input\n");return 2;}
  org_kde_kwin_fake_input_authenticate(fi,"qa","qa"); wl_display_roundtrip(d);
  char line[256]; double a,b; unsigned u,v;
  setvbuf(stdout,NULL,_IOLBF,0);
  while(fgets(line,sizeof line,stdin)){
    if(sscanf(line,"m %lf %lf",&a,&b)==2) org_kde_kwin_fake_input_pointer_motion_absolute(fi,wl_fixed_from_double(a),wl_fixed_from_double(b));
    else if(sscanf(line,"d %lf %lf",&a,&b)==2) org_kde_kwin_fake_input_pointer_motion(fi,wl_fixed_from_double(a),wl_fixed_from_double(b));
    else if(sscanf(line,"b %u %u",&u,&v)==2) org_kde_kwin_fake_input_button(fi,u,v);
    else if(sscanf(line,"k %u %u",&u,&v)==2) org_kde_kwin_fake_input_keyboard_key(fi,u,v);
    else if(sscanf(line,"a %u %lf",&u,&a)==2) org_kde_kwin_fake_input_axis(fi,u,wl_fixed_from_double(a));
    else if(sscanf(line,"s %u",&u)==1){ wl_display_roundtrip(d); usleep(u*1000); continue; }
    else if(line[0]=='t'){ struct timespec ts; clock_gettime(CLOCK_REALTIME,&ts); printf("T %lld %s",(long long)ts.tv_sec*1000+ts.tv_nsec/1000000,line+1); fflush(stdout); continue; } /* t TAG: print the wall clock ms when this line is executed */
    else if(!strncmp(line,"q",1)) break;
    wl_display_flush(d);
  }
  wl_display_roundtrip(d); return 0;
}
