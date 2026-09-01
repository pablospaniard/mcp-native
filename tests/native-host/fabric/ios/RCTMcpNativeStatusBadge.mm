#import "RCTMcpNativeStatusBadge.h"

#import <react/renderer/components/McpNativeFixtureSpec/ComponentDescriptors.h>
#import <react/renderer/components/McpNativeFixtureSpec/Props.h>
#import <react/renderer/components/McpNativeFixtureSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface RCTMcpNativeStatusBadge () <RCTMcpNativeStatusBadgeViewProtocol>
@end

@implementation RCTMcpNativeStatusBadge {
  UILabel *_labelView;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<McpNativeStatusBadgeComponentDescriptor>();
}

- (instancetype)init
{
  if (self = [super init]) {
    _labelView = [UILabel new];
    _labelView.adjustsFontForContentSizeCategory = YES;
    _labelView.font = [UIFont preferredFontForTextStyle:UIFontTextStyleBody];
    _labelView.numberOfLines = 0;
    _labelView.textAlignment = NSTextAlignmentCenter;
    _labelView.isAccessibilityElement = NO;
    self.isAccessibilityElement = YES;
    [self addSubview:_labelView];
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &oldStatusBadgeProps =
      *std::static_pointer_cast<McpNativeStatusBadgeProps const>(_props);
  const auto &newStatusBadgeProps =
      *std::static_pointer_cast<McpNativeStatusBadgeProps const>(props);

  if (oldStatusBadgeProps.label != newStatusBadgeProps.label) {
    _labelView.text = [NSString stringWithUTF8String:newStatusBadgeProps.label.c_str()];
  }
  if (oldStatusBadgeProps.tone != newStatusBadgeProps.tone) {
    NSString *tone = [NSString stringWithUTF8String:newStatusBadgeProps.tone.c_str()];
    if ([tone isEqualToString:@"positive"]) {
      _labelView.backgroundColor = [UIColor colorWithRed:0.84 green:0.95 blue:0.87 alpha:1.0];
      _labelView.textColor = [UIColor colorWithRed:0.05 green:0.32 blue:0.14 alpha:1.0];
    } else if ([tone isEqualToString:@"negative"]) {
      _labelView.backgroundColor = [UIColor colorWithRed:1.0 green:0.89 blue:0.88 alpha:1.0];
      _labelView.textColor = [UIColor colorWithRed:0.55 green:0.08 blue:0.06 alpha:1.0];
    } else {
      _labelView.backgroundColor = [UIColor colorWithWhite:0.91 alpha:1.0];
      _labelView.textColor = [UIColor colorWithWhite:0.15 alpha:1.0];
    }
  }

  [super updateProps:props oldProps:oldProps];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _labelView.frame = self.bounds;
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
  _labelView.text = nil;
}

@end
