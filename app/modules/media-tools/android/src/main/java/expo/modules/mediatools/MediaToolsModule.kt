package expo.modules.mediatools

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * 영상 변환·트림·무음·프레임 캡처. 모두 새 파일을 만들고 원본은 건드리지 않는다.
 * Transformer는 메인 스레드에서 만들어야 하므로 export()는 Dispatchers.Main에서 호출한다.
 */
class MediaToolsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MediaTools")

    Events("onProgress")

    AsyncFunction("transcode720p") Coroutine { inputPath: String ->
      val output = newOutputFile("mp4")
      val item = EditedMediaItem.Builder(MediaItem.fromUri(toUri(inputPath)))
        .setEffects(Effects(emptyList(), listOf(Presentation.createForHeight(720))))
        .build()
      export(item, output, mute = false)
      val durationMs = withContext(Dispatchers.IO) { readDurationMs(output) }
      mapOf(
        "outputPath" to output.absolutePath,
        "durationMs" to durationMs,
        "sizeBytes" to output.length(),
      )
    }

    AsyncFunction("trim") Coroutine { inputPath: String, startMs: Double, endMs: Double ->
      val output = newOutputFile("mp4")
      val clipping = MediaItem.ClippingConfiguration.Builder()
        .setStartPositionMs(startMs.toLong())
        .setEndPositionMs(endMs.toLong())
        .build()
      val mediaItem = MediaItem.Builder()
        .setUri(toUri(inputPath))
        .setClippingConfiguration(clipping)
        .build()
      export(EditedMediaItem.Builder(mediaItem).build(), output, mute = false)
      mapOf("outputPath" to output.absolutePath)
    }

    AsyncFunction("mute") Coroutine { inputPath: String ->
      val output = newOutputFile("mp4")
      val item = EditedMediaItem.Builder(MediaItem.fromUri(toUri(inputPath)))
        .setRemoveAudio(true)
        .build()
      export(item, output, mute = true)
      mapOf("outputPath" to output.absolutePath)
    }

    AsyncFunction("captureFrame") Coroutine { inputPath: String, atMs: Double ->
      val output = newOutputFile("jpg")
      withContext(Dispatchers.IO) {
        val retriever = MediaMetadataRetriever()
        try {
          retriever.setDataSource(context, toUri(inputPath))
          val bitmap = retriever.getFrameAtTime(
            (atMs * 1000).toLong(),
            MediaMetadataRetriever.OPTION_CLOSEST,
          ) ?: throw CodedException("ERR_NO_FRAME", "해당 시점의 프레임을 읽지 못했습니다.", null)
          FileOutputStream(output).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }
        } finally {
          retriever.release()
        }
      }
      mapOf("imagePath" to output.absolutePath)
    }
  }

  private val context
    get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "React context가 없습니다.", null)

  private fun toUri(path: String): Uri =
    if (path.startsWith("file://") || path.startsWith("content://")) Uri.parse(path) else Uri.fromFile(File(path))

  private fun newOutputFile(ext: String): File {
    val dir = File(context.cacheDir, "media-tools").apply { mkdirs() }
    return File(dir, "${UUID.randomUUID()}.$ext")
  }

  private fun readDurationMs(file: File): Long {
    val retriever = MediaMetadataRetriever()
    return try {
      retriever.setDataSource(file.absolutePath)
      retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
    } finally {
      retriever.release()
    }
  }

  /** Transformer 한 건을 끝까지 돌리고 결과를 기다린다. 메인 스레드에서 실행. */
  private suspend fun export(item: EditedMediaItem, output: File, mute: Boolean) {
    withContext(Dispatchers.Main) {
      suspendCancellableCoroutine { cont ->
        val transformer = Transformer.Builder(context)
          .setVideoMimeType(MimeTypes.VIDEO_H264)
          .apply { if (!mute) setAudioMimeType(MimeTypes.AUDIO_AAC) }
          .addListener(object : Transformer.Listener {
            override fun onCompleted(composition: Composition, exportResult: ExportResult) {
              if (cont.isActive) cont.resume(Unit)
            }

            override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
              if (cont.isActive) {
                cont.resumeWithException(
                  CodedException("ERR_EXPORT", "내보내기 실패: ${exportException.message}", exportException),
                )
              }
            }
          })
          .build()
        transformer.start(item, output.absolutePath)
        cont.invokeOnCancellation { transformer.cancel() }
      }
    }
  }
}
