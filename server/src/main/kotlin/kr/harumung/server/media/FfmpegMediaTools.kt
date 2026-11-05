package kr.harumung.server.media

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.TimeUnit

/**
 * 브라우저가 올린 원본(iOS mp4 / Android webm)을 720p H.264 mp4로 통일하고,
 * 트림·무음·프레임 캡처를 처리한다. 출력은 항상 새 파일이고 원본은 건드리지 않는다.
 * ffmpeg CLI를 ProcessBuilder로 호출한다. 처리 큐 연결은 3주차.
 */
@Service
class FfmpegMediaTools(
    @Value("\${harumung.media.ffmpeg:ffmpeg}") private val ffmpeg: String,
    @Value("\${harumung.media.work-dir:/tmp/harumung-media}") private val workDir: String,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    data class Transcoded(val output: Path, val durationMs: Long, val sizeBytes: Long)

    fun isAvailable(): Boolean = runCatching {
        ProcessBuilder(ffmpeg, "-version").redirectErrorStream(true).start().waitFor(5, TimeUnit.SECONDS)
    }.getOrDefault(false)

    /** 720p 30fps H.264 mp4, 약 4Mbps. 세로 영상은 높이 기준으로 맞춘다. */
    fun transcode720p(input: Path): Transcoded {
        val output = newOutput("mp4")
        run(
            "-i", input.toString(),
            "-vf", "scale='if(gt(iw,ih),-2,720)':'if(gt(iw,ih),720,-2)'",
            "-r", "30",
            "-c:v", "libx264", "-preset", "veryfast", "-b:v", "4M", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            output.toString(),
        )
        return Transcoded(output, probeDurationMs(output), Files.size(output))
    }

    /** startMs~endMs 구간만 남긴다. 재인코딩 없이 자르면 키프레임 경계가 어긋나므로 재인코딩한다. */
    fun trim(input: Path, startMs: Long, endMs: Long): Path {
        require(endMs > startMs) { "끝 시각이 시작 시각보다 커야 합니다." }
        val output = newOutput("mp4")
        run(
            "-ss", ms(startMs), "-to", ms(endMs), "-i", input.toString(),
            "-c:v", "libx264", "-preset", "veryfast", "-b:v", "4M", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
            output.toString(),
        )
        return output
    }

    fun mute(input: Path): Path {
        val output = newOutput("mp4")
        run("-i", input.toString(), "-c:v", "copy", "-an", "-movflags", "+faststart", output.toString())
        return output
    }

    fun captureFrame(input: Path, atMs: Long): Path {
        val output = newOutput("jpg")
        run("-ss", ms(atMs), "-i", input.toString(), "-frames:v", "1", "-q:v", "2", output.toString())
        return output
    }

    private fun probeDurationMs(file: Path): Long {
        val proc = ProcessBuilder(
            ffmpeg.replace("ffmpeg", "ffprobe"),
            "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file.toString(),
        ).redirectErrorStream(true).start()
        val text = proc.inputStream.bufferedReader().readText().trim()
        proc.waitFor(10, TimeUnit.SECONDS)
        return text.toDoubleOrNull()?.let { (it * 1000).toLong() } ?: 0L
    }

    private fun run(vararg args: String) {
        val cmd = listOf(ffmpeg, "-y", "-hide_banner", "-loglevel", "error") + args
        log.debug("ffmpeg: {}", cmd.joinToString(" "))
        val proc = ProcessBuilder(cmd).redirectErrorStream(true).start()
        val out = proc.inputStream.bufferedReader().readText()
        if (!proc.waitFor(120, TimeUnit.SECONDS)) {
            proc.destroyForcibly()
            throw MediaProcessingException("ffmpeg 시간 초과")
        }
        if (proc.exitValue() != 0) throw MediaProcessingException("ffmpeg 실패: ${out.take(500)}")
    }

    private fun newOutput(ext: String): Path {
        val dir = Path.of(workDir)
        Files.createDirectories(dir)
        return dir.resolve("${java.util.UUID.randomUUID()}.$ext")
    }

    private fun ms(v: Long): String = "%.3f".format(v / 1000.0)
}

class MediaProcessingException(message: String) : RuntimeException(message)
