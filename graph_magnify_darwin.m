#import <AppKit/AppKit.h>

extern void goObailsGraphMagnify(double magnification);

void setupObailsGraphMagnifyMonitor(void) {
    [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskMagnify
                                          handler:^NSEvent * _Nullable(NSEvent *event) {
        goObailsGraphMagnify((double)[event magnification]);
        return event;
    }];
}
