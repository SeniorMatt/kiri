// shot OUT.raw [N] : N (default 1) KWin ScreenShot2 CaptureWorkspace shots; shot k goes to OUT.raw (N=1) or OUT.<k>.raw, each
// "W H\n" then W*H*4 raw BGRA. Prints the wall clock (ms) of each capture start to stdout.
#include <QtDBus>
#include <QImage>
#include <QGuiApplication>
#include <unistd.h>
#include <poll.h>
#include <thread>
#include <atomic>
#include <cstdio>
#include <chrono>
int main(int argc,char**argv){
  QGuiApplication app(argc,argv);
  if(argc<2) return 3;
  int N=argc>2?atoi(argv[2]):1;
  QDBusInterface si("org.kde.KWin","/org/kde/KWin/ScreenShot2","org.kde.KWin.ScreenShot2",QDBusConnection::sessionBus());
  if(!si.isValid()){fprintf(stderr,"no iface\n");return 1;}
  for(int k=0;k<N;k++){
    int p[2]; if(pipe(p))return 2;
    QVariantMap o; o["include-cursor"]=false; o["native-resolution"]=true;
    QByteArray buf; std::atomic<long> want{0}; std::atomic<bool> stop{false};
    std::thread rd([&]{ char tmp[65536]; while(!stop){ if(want>0 && buf.size()>=want) break; pollfd pf{p[0],POLLIN,0}; if(poll(&pf,1,20)>0){ ssize_t n=read(p[0],tmp,sizeof tmp); if(n<=0) break; buf.append(tmp,n);} } });
    auto m=QDBusMessage::createMethodCall("org.kde.KWin","/org/kde/KWin/ScreenShot2","org.kde.KWin.ScreenShot2","CaptureWorkspace");
    m<<o<<QVariant::fromValue(QDBusUnixFileDescriptor(p[1]));
    close(p[1]);
    long long t=std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
    QDBusMessage r=QDBusConnection::sessionBus().call(m,QDBus::Block,8000);
    if(r.type()!=QDBusMessage::ReplyMessage){fprintf(stderr,"%s\n",qPrintable(r.errorMessage())); stop=true; rd.join(); close(p[0]); return 4;}
    QVariantMap mm=qdbus_cast<QVariantMap>(r.arguments().at(0).value<QDBusArgument>());
    int ww=mm["width"].toInt(),hh=mm["height"].toInt(),st=mm["stride"].toInt();
    want=(long)st*hh; rd.join(); close(p[0]);
    if(buf.size()<want){fprintf(stderr,"short %d\n",(int)buf.size()); return 6;}
    QImage img((const uchar*)buf.constData(),ww,hh,st,(QImage::Format)mm["format"].toInt());
    QImage s=img.convertToFormat(QImage::Format_ARGB32);
    int down=qEnvironmentVariableIntValue("SHOT_DOWN"); if(down>1) s=s.scaled(s.width()/down,s.height()/down,Qt::IgnoreAspectRatio,Qt::FastTransformation);
    char path[512]; if(N==1) snprintf(path,sizeof path,"%s",argv[1]); else snprintf(path,sizeof path,"%s.%d.raw",argv[1],k);
    FILE*f=fopen(path,"wb"); if(!f) return 5;
    fprintf(f,"%d %d\n",s.width(),s.height()); fwrite(s.constBits(),1,(size_t)s.sizeInBytes(),f); fclose(f);
    printf("%d %lld\n",k,t); fflush(stdout);
  }
  return 0;
}
