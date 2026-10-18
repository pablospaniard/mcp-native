import Foundation
import SwiftUI

public enum RendererError: Error, Sendable, Equatable {
  case bridgeLimit
  case bridgeUnavailable
  case closed
  case invalidResponse
  case rejected(String)
}

public struct ResourceGrant: Sendable, Codable, Equatable {
  public let allowedOrigins: [String]
  public let allowedMIMETypes: [String]
  public let maximumBytes: Int
  public let maximumRedirects: Int
  public let maximumDecodedWidth: Int?
  public let maximumDecodedHeight: Int?
  public let maximumDecodedPixels: Int?
  public let allowsAutoplay: Bool
  public let allowsBackgroundPlayback: Bool
  public let allowsExternalRoutes: Bool
  public let requiresUserActivation: Bool

  public init(
    allowedOrigins: [String], allowedMIMETypes: [String] = [], maximumBytes: Int,
    maximumRedirects: Int = 0, maximumDecodedWidth: Int? = nil,
    maximumDecodedHeight: Int? = nil, maximumDecodedPixels: Int? = nil,
    allowsAutoplay: Bool = false, allowsBackgroundPlayback: Bool = false,
    allowsExternalRoutes: Bool = false, requiresUserActivation: Bool = true
  ) {
    self.allowedOrigins = allowedOrigins
    self.allowedMIMETypes = allowedMIMETypes
    self.maximumBytes = maximumBytes
    self.maximumRedirects = maximumRedirects
    self.maximumDecodedWidth = maximumDecodedWidth
    self.maximumDecodedHeight = maximumDecodedHeight
    self.maximumDecodedPixels = maximumDecodedPixels
    self.allowsAutoplay = allowsAutoplay
    self.allowsBackgroundPlayback = allowsBackgroundPlayback
    self.allowsExternalRoutes = allowsExternalRoutes
    self.requiresUserActivation = requiresUserActivation
  }
}

public struct RendererPolicy: Sendable, Codable, Equatable {
  public var allowedComponentNames: [String]
  public var allowedEventNames: [String]
  public var allowedFunctionNames: [String]
  public var locale: String
  public var imageGrants: [String: ResourceGrant]
  public var mediaGrants: [String: ResourceGrant]
  public var hostExtensions: [HostExtensionGrant]
  public var maximumOperations: Int

  public init(
    allowedComponentNames: [String], allowedEventNames: [String] = [],
    allowedFunctionNames: [String] = [], locale: String = Locale.current.identifier,
    imageGrants: [String: ResourceGrant] = [:], mediaGrants: [String: ResourceGrant] = [:],
    hostExtensions: [HostExtensionGrant] = [],
    maximumOperations: Int = 10_000
  ) {
    self.allowedComponentNames = allowedComponentNames
    self.allowedEventNames = allowedEventNames
    self.allowedFunctionNames = allowedFunctionNames
    // Foundation commonly reports identifiers such as en_US; renderer-core accepts BCP 47.
    self.locale = locale.replacingOccurrences(of: "_", with: "-")
    self.imageGrants = imageGrants
    self.mediaGrants = mediaGrants
    self.hostExtensions = hostExtensions
    self.maximumOperations = maximumOperations
  }
}

public struct HostExtensionGrant: Sendable, Codable, Equatable {
  public let manifest: JSONValue
  public let permissions: [String]
  public let resources: [String]

  public init(manifest: JSONValue, permissions: [String] = [], resources: [String] = []) {
    self.manifest = manifest
    self.permissions = permissions
    self.resources = resources
  }
}

public struct ActionProposal: Sendable, Equatable {
  public let envelope: JSONValue
  public let dataModel: JSONValue?
}

public struct HostExtensionEvent: Sendable, Equatable {
  public let extensionID: String
  public let catalogID: String
  public let schemaVersion: String
  public let componentName: String
  public let surfaceID: String
  public let sourceComponentID: String
  public let name: String
  public let payload: JSONValue
  public let userActivated: Bool
}

public struct NativeNode: Sendable, Equatable, Identifiable {
  public let id: String
  public let component: String
  public let props: [String: JSONValue]
  public let children: [NativeNode]
  public let controlID: String?
}

public struct Publication: Sendable, Equatable {
  public let generation: Int
  public let renderRevision: Int
  public let serverModelRevision: Int
  public let surfaceIncarnation: Int
  public let root: NativeNode
}

public struct HostCatalog {
  public typealias ResourceView = @MainActor @Sendable (NativeNode, ResourceGrant) -> AnyView
  public typealias ExtensionEmitter = @MainActor @Sendable (String, JSONValue, Bool) -> Void
  public typealias ExtensionView = @MainActor @Sendable (NativeNode, @escaping ExtensionEmitter) -> AnyView

  public struct ExtensionRegistration {
    public let manifestFingerprint: String
    public let view: ExtensionView

    public init(manifestFingerprint: String, view: @escaping ExtensionView) {
      self.manifestFingerprint = manifestFingerprint
      self.view = view
    }
  }

  public var image: ResourceView?
  public var video: ResourceView?
  public var audio: ResourceView?
  public var extensions: [String: ExtensionRegistration]

  public init(
    image: ResourceView? = nil, video: ResourceView? = nil, audio: ResourceView? = nil,
    extensions: [String: ExtensionRegistration] = [:]
  ) {
    self.image = image
    self.video = video
    self.audio = audio
    self.extensions = extensions
  }
}
